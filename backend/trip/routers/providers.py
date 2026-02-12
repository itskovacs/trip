import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..deps import SessionDep, get_current_username
from ..models.models import (LatitudeLongitude, OSMRoutingQuery,
                             OSMRoutingResponse, ProviderBoundaries,
                             ProviderPlaceResult, User)
from ..utils.csv import iter_csv_lines
from ..utils.providers import (BaseMapProvider, GoogleMapsProvider,
                               OpenStreetMapProvider)
from ..utils.zip import parse_mymaps_kmz

router = APIRouter(prefix="/api/completions", tags=["completions"])


def _get_user(session: SessionDep, current_user: str):
    db_user = session.get(User, current_user)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


def _raise_missing_apikey(db_user, raise_msg="") -> bool:
    if not db_user.google_apikey:
        raise HTTPException(
            status_code=400, detail=raise_msg if raise_msg else "Google Maps API key not configured"
        )


def _get_map_provider(session: SessionDep, current_user: str) -> BaseMapProvider:
    db_user = _get_user(session, current_user)
    provider_type = getattr(db_user, "map_provider", "osm").lower()
    if provider_type == "google":
        _raise_missing_apikey(db_user)
        return GoogleMapsProvider(api_key=db_user.google_apikey)

    return OpenStreetMapProvider()


async def _process_batch(
    items: list[str | dict],
    provider: BaseMapProvider,
    processor_func,
) -> list[ProviderPlaceResult]:
    if not items:
        return []

    semaphore = asyncio.Semaphore(4)

    async def _process_with_semaphore(item):
        async with semaphore:
            return await processor_func(item, provider)

    results = await asyncio.gather(
        *[_process_with_semaphore(item) for item in items],
        return_exceptions=True,
    )

    return [r for r in results if isinstance(r, ProviderPlaceResult)]


@router.post("/bulk")
async def bulk_to_places(
    data: list[str],
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[ProviderPlaceResult]:
    provider = _get_map_provider(session, current_user)

    async def _process_content(content: str, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            if "google.com/maps" in content:
                db_user = _get_user(session, current_user)
                _raise_missing_apikey(db_user, "Google Maps links provided but missing API key")
                provider = GoogleMapsProvider(api_key=db_user.google_apikey)
                if result := await provider.url_to_place(content):
                    return await provider.result_to_place(result)
            else:
                if results := await provider.text_search(content):
                    return await provider.result_to_place(results[0])
        except Exception:
            pass
        return None

    return await _process_batch(data, provider, _process_content)


@router.get("/search")
async def text_search(
    q: str,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[ProviderPlaceResult]:
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query required")

    provider = _get_map_provider(session, current_user)
    results = await provider.text_search(q.strip())

    if not results:
        return []

    async def _process_result(place_data: dict, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            return await provider.result_to_place(place_data)
        except Exception:
            return None

    return await _process_batch(results, provider, _process_result)


@router.post("/nearby")
async def nearby_search(
    data: LatitudeLongitude,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[ProviderPlaceResult]:
    provider = _get_map_provider(session, current_user)

    location = {"latitude": data.latitude, "longitude": data.longitude}
    results = await provider.search_nearby(location)

    if not results:
        return []

    async def _process_result(place_data: dict, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            return await provider.result_to_place(place_data)
        except Exception:
            return None

    return await _process_batch(results, provider, _process_result)


@router.get("/geocode")
async def geocode_search(
    q: str,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> ProviderBoundaries:
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query required")

    provider = _get_map_provider(session, current_user)
    if not (bounds := await provider.geocode(q.strip())):
        raise HTTPException(status_code=404, detail="Location not found")
    return bounds


#####
## OSM-specific
@router.post("/route")
async def get_route(
    data: OSMRoutingQuery,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> OSMRoutingResponse:
    return await OpenStreetMapProvider().get_route(data)


#####
## Google-specific
@router.post("/mymaps-import")
async def google_mymaps_kmz_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[ProviderPlaceResult]:
    db_user = _get_user(session, current_user)
    _raise_missing_apikey(db_user)
    provider = GoogleMapsProvider(api_key=db_user.google_apikey)

    if not file.filename or not file.filename.lower().endswith(".kmz"):
        raise HTTPException(status_code=400, detail="Invalid KMZ file")

    places = await parse_mymaps_kmz(file)

    async def _process_kml_place(place: dict, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            if url := place.get("url"):
                if place_data := await provider.url_to_place(url):
                    return await provider.result_to_place(place_data)
            elif place.get("lat") and place.get("lng"):
                location = {
                    "latitude": float(place.get("lat")),
                    "longitude": float(place.get("lng")),
                }
                results = await provider.text_search(place.get("name"), location)
                return await provider.result_to_place(results[0])
        except Exception:
            return None

    return await _process_batch(places, provider, _process_kml_place)


@router.post("/takeout-import")
async def google_takeout_csv_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[ProviderPlaceResult]:
    db_user = _get_user(session, current_user)
    _raise_missing_apikey(db_user)
    provider = GoogleMapsProvider(api_key=db_user.google_apikey)

    if file.content_type != "text/csv":
        raise HTTPException(status_code=400, detail="Expected CSV file")

    urls = []
    async for row in iter_csv_lines(file):
        if url := row.get("URL"):
            urls.append(url)

    if not urls:
        return []

    async def _process_url(url: str, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            if place_data := await provider.url_to_place(url):
                return await provider.result_to_place(place_data)
        except Exception:
            pass
        return None

    return await _process_batch(urls, provider, _process_url)


@router.get("/google/resolve-shortlink/{link_id}")
async def google_resolve_shortlink(
    link_id: str,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> ProviderPlaceResult:
    if not link_id:
        raise HTTPException(status_code=400, detail="Google ID is missing, resolve failed")

    db_user = _get_user(session, current_user)
    _raise_missing_apikey(db_user)
    provider = GoogleMapsProvider(api_key=db_user.google_apikey)
    url = await provider._resolve_shortlink(link_id)

    if place_data := await provider.url_to_place(url):
        return await provider.result_to_place(place_data)

    raise HTTPException(status_code=404, detail="Place not found")
