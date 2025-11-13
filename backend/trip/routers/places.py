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
from ..utils.gmaps import (gmaps_get_boundaries, gmaps_textsearch,
                           gmaps_url_to_search, result_to_place)
from ..utils.utils import (b64img_decode, download_file, patch_image,
                           save_image_to_file)

router = APIRouter(prefix="/api/places", tags=["places"])


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
async def process_multilinks(
    links: list[str], session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[GooglePlaceResult]:
    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")

    places = []
    for url in links:
        result = await gmaps_url_to_search(url, db_user.google_apikey)
        place = await result_to_place(result, db_user.google_apikey)
        places.append(place)
    return places


@router.post("/google-takeout-import")
async def process_takeout_csv(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[GooglePlaceResult]:
    # TODO: chunk.decode?
    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")

    content_type = file.content_type
    if content_type != "text/csv":
        raise HTTPException(status_code=400, detail="Bad request, expected CSV file")

    places = []
    async for row in iter_csv_lines(file):
        url = row.pop("URL", None)
        if not url:
            continue
        result = await gmaps_url_to_search(url, db_user.google_apikey)
        place = await result_to_place(result, db_user.google_apikey)
        places.append(place)
    return places


@router.get("/google-search")
async def google_search_text(
    q: str, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[GooglePlaceResult]:
    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")

    data = await gmaps_textsearch(q, db_user.google_apikey)
    places = []
    for result in data:
        place = await result_to_place(result, db_user.google_apikey)
        places.append(place)
    return places


@router.get("/google-geocode")
async def google_geocode_search(
    q: str, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
):
    db_user = session.get(User, current_user)
    if not db_user or not db_user.google_apikey:
        raise HTTPException(status_code=400, detail="Google Maps API key not configured")

    bounds = await gmaps_get_boundaries(q, db_user.google_apikey)
    if not bounds:
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
