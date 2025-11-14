import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import selectinload
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Category, GooglePlaceResult, Image, Place,
                             PlaceCreate, PlaceRead, PlacesCreate, PlaceUpdate,
                             User)
from ..security import verify_exists_and_owns
from ..utils.csv import iter_csv_lines
from ..utils.gmaps import (cid_to_pid, gmaps_get_boundaries, gmaps_pid_search,
                           gmaps_textsearch, gmaps_url_to_search,
                           result_to_place)
from ..utils.utils import (b64img_decode, download_file, patch_image,
                           save_image_to_file)
from ..utils.zip import extract_cids_from_kmz

router = APIRouter(prefix="/api/places", tags=["places"])


async def _process_gmaps_batch(items: list[str], api_key: str, processor_func) -> list[GooglePlaceResult]:
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


@router.post("/google-multilinks")
async def google_links_to_places(
    links: list[str], session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[GooglePlaceResult]:
    db_user = session.get(User, current_user)
    if not links:
        return []

    async def _process_url(url: str, api_key: str) -> GooglePlaceResult | None:
        if result := await gmaps_url_to_search(url, api_key):
            return await result_to_place(result, api_key)
        return None

    return await _process_gmaps_batch(
        links,
        db_user.google_apikey,
        _process_url,
    )


@router.post("/google-kmz-import")
async def google_kmz_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[GooglePlaceResult]:
    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")
    if not file.filename or not file.filename.lower().endswith((".kmz")):
        raise HTTPException(status_code=400, detail="Invalid KMZ file")

    cids = await extract_cids_from_kmz(file)
    if not cids:
        return []

    async def _process_cid(cid: str, api_key: str) -> GooglePlaceResult | None:
        try:
            pid = await cid_to_pid(cid, api_key)
            result = await gmaps_pid_search(pid, api_key)
            return await result_to_place(result, api_key)
        except Exception:
            return None

    return await _process_gmaps_batch(
        list(cids),
        db_user.google_apikey,
        _process_cid,
    )


@router.post("/google-takeout-import")
async def google_takeout_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[GooglePlaceResult]:
    # TODO: chunk.decode?
    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")

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
        db_user.google_apikey,
        _process_url,
    )


@router.get("/google-search")
async def google_search_text(
    q: str, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[GooglePlaceResult]:
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Bad Request")

    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")

    results = await gmaps_textsearch(q.strip(), db_user.google_apikey)
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
        db_user.google_apikey,
        _process_result,
    )


@router.get("/google-geocode")
async def google_geocode_search(
    q: str, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
):
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Bad Request")

    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")

    if not (bounds := await gmaps_get_boundaries(q.strip(), db_user.google_apikey)):
        raise HTTPException(status_code=400, detail="Location not resolved by GMaps")
    return bounds


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
