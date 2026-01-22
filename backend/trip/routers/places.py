import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import selectinload
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Category, GooglePlaceResult, Image,
                             LatitudeLongitude, Place, PlaceCreate, PlaceRead,
                             PlacesCreate, PlaceUpdate, User)
from ..security import verify_exists_and_owns
from ..utils.csv import iter_csv_lines
from ..utils.gmaps import (gmaps_get_boundaries, gmaps_nearbysearch,
                           gmaps_resolve_shortlink, gmaps_textsearch,
                           gmaps_url_to_search, result_to_place)
from ..utils.utils import (b64img_decode, download_file, patch_image,
                           save_image_to_file)
from ..utils.zip import parse_mymaps_kmz

router = APIRouter(prefix="/api/places", tags=["places"])


def _get_user_api_key(session: SessionDep, current_user: str) -> str:
    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")
    return db_user.google_apikey


async def _process_gmaps_batch(
    items: list[str | dict], api_key: str, processor_func
) -> list[GooglePlaceResult]:
    if not items:
        return []

    semaphore = asyncio.Semaphore(4)

    async def _process_with_semaphore(item):
        async with semaphore:
            return await processor_func(item, api_key)

    results = await asyncio.gather(
        *[_process_with_semaphore(item) for item in items],
        return_exceptions=True,
    )

    return [result for result in results if isinstance(result, GooglePlaceResult)]


@router.get("", response_model=list[PlaceRead])
def read_places(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[PlaceRead]:
    db_places = session.exec(
        select(Place)
        .options(selectinload(Place.image), selectinload(Place.category))
        .where(Place.user == current_user)
    ).all()
    return [PlaceRead.serialize(p) for p in db_places]


@router.post("", response_model=PlaceRead)
async def create_place(
    place: PlaceCreate, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> PlaceRead:
    new_place = Place(
        name=place.name,
        lat=place.lat,
        lng=place.lng,
        place=place.place,
        gpx=place.gpx,
        allowdog=place.allowdog,
        description=place.description,
        price=place.price,
        duration=place.duration,
        category_id=place.category_id,
        visited=place.visited,
        user=current_user,
    )

    if place.image:
        if place.image[:4] == "http":
            fp = await download_file(place.image)
            if fp:
                patch_image(fp)
                image = Image(filename=fp.split("/")[-1], user=current_user)
                session.add(image)
                session.flush()
                session.refresh(image)
                new_place.image_id = image.id
        else:
            image_bytes = b64img_decode(place.image)
            filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
            if not filename:
                raise HTTPException(status_code=400, detail="Bad request")
            image = Image(filename=filename, user=current_user)
            session.add(image)
            session.commit()
            session.refresh(image)
            new_place.image_id = image.id

    session.add(new_place)
    session.commit()
    session.refresh(new_place)
    return PlaceRead.serialize(new_place)


@router.post("/batch", response_model=list[PlaceRead])
async def create_places(
    places: list[PlacesCreate],
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[PlaceRead]:
    new_places = []

    for place in places:
        category_name = place.category
        category = session.exec(
            select(Category).where(Category.user == current_user, Category.name == category_name)
        ).first()
        if not category:
            continue

        new_place = Place(
            name=place.name,
            lat=place.lat,
            lng=place.lng,
            place=place.place,
            gpx=place.gpx,
            allowdog=place.allowdog,
            description=place.description,
            price=place.price,
            duration=place.duration,
            category_id=category.id,
            user=current_user,
        )

        if place.image:  # It's a link, dl file
            fp = await download_file(place.image)
            if fp:
                patch_image(fp)
                image = Image(filename=fp.split("/")[-1], user=current_user)
                session.add(image)
                session.flush()
                new_place.image_id = image.id

        session.add(new_place)
        new_places.append(new_place)

    session.commit()
    return [PlaceRead.serialize(p) for p in new_places]


@router.post("/google-bulk")
async def google_bulk_to_places(
    data: list[str], session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[GooglePlaceResult]:
    api_key = _get_user_api_key(session, current_user)

    async def _process_content(content: str, api_key: str) -> GooglePlaceResult | None:
        if "google.com/maps/place/" in content:
            if result := await gmaps_url_to_search(content, api_key):
                return await result_to_place(result, api_key)
        else:
            if result := await gmaps_textsearch(content, api_key):
                return await result_to_place(result[0], api_key)
        return None

    return await _process_gmaps_batch(
        data,
        api_key,
        _process_content,
    )


@router.post("/google-kmz-import")
async def google_kmz_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[GooglePlaceResult]:
    api_key = _get_user_api_key(session, current_user)
    if not file.filename or not file.filename.lower().endswith((".kmz")):
        raise HTTPException(status_code=400, detail="Invalid KMZ file")

    places = await parse_mymaps_kmz(file)

    async def _process_kml_place(place: dict, api_key: str) -> GooglePlaceResult | None:
        try:
            location = {"latitude": float(place.get("lat")), "longitude": float(place.get("lng"))}
            results = await gmaps_textsearch(place.get("name"), api_key, location)
            return await result_to_place(results[0], api_key)
        except Exception:
            return None

    return await _process_gmaps_batch(
        places,
        api_key,
        _process_kml_place,
    )


@router.post("/google-takeout-import")
async def google_takeout_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[GooglePlaceResult]:
    # TODO: chunk.decode?
    api_key = _get_user_api_key(session, current_user)
    if file.content_type != "text/csv":
        raise HTTPException(status_code=400, detail="Bad request, expected CSV file")

    urls = []
    async for row in iter_csv_lines(file):
        if url := row.get("URL"):
            urls.append(url)

    if not urls:
        return []

    async def _process_url(url: str, api_key: str) -> GooglePlaceResult | None:
        if place_data := await gmaps_url_to_search(url, api_key):
            return await result_to_place(place_data, api_key)
        return None

    return await _process_gmaps_batch(
        urls,
        api_key,
        _process_url,
    )


@router.get("/google-search")
async def google_search_text(
    q: str, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[GooglePlaceResult]:
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Bad Request")

    api_key = _get_user_api_key(session, current_user)
    results = await gmaps_textsearch(q.strip(), api_key)
    if not results:
        return []

    async def _process_result(
        place_data: dict,
        api_key: str,
    ) -> GooglePlaceResult | None:
        try:
            return await result_to_place(place_data, api_key)
        except Exception:
            return None

    return await _process_gmaps_batch(
        results,
        api_key,
        _process_result,
    )


@router.get("/google-geocode")
async def google_geocode_search(
    q: str, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
):
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Bad Request")

    api_key = _get_user_api_key(session, current_user)
    if not (bounds := await gmaps_get_boundaries(q.strip(), api_key)):
        raise HTTPException(status_code=400, detail="Location not resolved by GMaps")
    return bounds


@router.post("/google-nearby-search")
async def google_nearby_search(
    data: LatitudeLongitude, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[GooglePlaceResult]:
    api_key = _get_user_api_key(session, current_user)
    location = {"latitude": data.latitude, "longitude": data.longitude}
    results = await gmaps_nearbysearch(location, api_key)
    if not results:
        return []

    async def _process_result(
        place_data: dict,
        api_key: str,
    ) -> GooglePlaceResult | None:
        try:
            return await result_to_place(place_data, api_key)
        except Exception:
            return None

    return await _process_gmaps_batch(
        results,
        api_key,
        _process_result,
    )


@router.get("/google-resolve/{id}")
async def google_resolve_shortlink(
    id: str, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> GooglePlaceResult:
    if not id:
        raise HTTPException(status_code=400, detail="Bad Request")
    api_key = _get_user_api_key(session, current_user)
    url = await gmaps_resolve_shortlink(id)
    if not url:
        raise HTTPException(status_code=400, detail="Bad Request")

    if place_data := await gmaps_url_to_search(url, api_key):
        return await result_to_place(place_data, api_key)
    raise HTTPException(status_code=400, detail="Bad Request")


@router.put("/{place_id}", response_model=PlaceRead)
def update_place(
    session: SessionDep,
    place_id: int,
    place: PlaceUpdate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> PlaceRead:
    db_place = session.get(Place, place_id)
    verify_exists_and_owns(current_user, db_place)

    place_data = place.model_dump(exclude_unset=True)
    image = place_data.pop("image", None)
    if image:
        try:
            image_bytes = b64img_decode(image)
        except Exception:
            raise HTTPException(status_code=400, detail="Bad request")

        filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.commit()
        session.refresh(image)

        if db_place.image_id:
            old_image = session.get(Image, db_place.image_id)
            try:
                session.delete(old_image)
                db_place.image_id = None
                session.refresh(db_place)
            except Exception:
                raise HTTPException(status_code=400, detail="Bad request")

        db_place.image_id = image.id

    for key, value in place_data.items():
        setattr(db_place, key, value)

    session.add(db_place)
    session.commit()
    session.refresh(db_place)
    return PlaceRead.serialize(db_place)


@router.delete("/{place_id}")
def delete_place(
    session: SessionDep, place_id: int, current_user: Annotated[str, Depends(get_current_username)]
):
    db_place = session.get(Place, place_id)
    verify_exists_and_owns(current_user, db_place)

    if db_place.image:
        try:
            session.delete(db_place.image)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Roses are red, violets are blue, if you're reading this, I'm sorry for you",
            )

    session.delete(db_place)
    session.commit()
    return {}


@router.get("/{place_id}", response_model=PlaceRead)
def get_place(
    session: SessionDep,
    place_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> PlaceRead:
    db_place = session.exec(
        select(Place)
        .options(selectinload(Place.image), selectinload(Place.category))
        .where(Place.id == place_id)
    ).first()
    verify_exists_and_owns(current_user, db_place)

    return PlaceRead.serialize(db_place, exclude_gpx=False)
