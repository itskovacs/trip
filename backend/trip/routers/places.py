from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Category, Image, Place, PlaceCreate, PlaceRead,
                             PlacesCreate, PlaceUpdate)
from ..security import verify_exists_and_owns
from ..utils.utils import (b64img_decode, download_file, patch_image,
                           remove_image, save_image_to_file)

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("", response_model=list[PlaceRead])
def read_places(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[PlaceRead]:
    places = session.exec(select(Place).filter(Place.user == current_user))
    return [PlaceRead.serialize(p) for p in places]


@router.post("", response_model=PlaceRead)
def create_place(
    place: PlaceCreate, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> PlaceRead:
    new_place = Place(
        name=place.name,
        lat=place.lat,
        lng=place.lng,
        place=place.place,
        allowdog=place.allowdog,
        description=place.description,
        price=place.price,
        duration=place.duration,
        category_id=place.category_id,
        visited=place.visited,
        user=current_user,
    )

    if place.image:
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
            select(Category).filter(Category.user == current_user, Category.name == category_name)
        ).first()
        if not category:
            continue

        new_place = Place(
            name=place.name,
            lat=place.lat,
            lng=place.lng,
            place=place.place,
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
    image = place_data.pop("image")
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

        place_data.pop("image")
        place_data["image_id"] = image.id

        if db_place.image_id:
            old_image = session.get(Image, db_place.image_id)
            try:
                remove_image(old_image.filename)
                session.delete(old_image)
            except Exception:
                raise HTTPException(status_code=400, detail="Bad request")

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
            remove_image(db_place.image.filename)
            session.delete(db_place.image)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Roses are red, violets are blue, if you're reading this, I'm sorry for you",
            )

    session.delete(db_place)
    session.commit()
    return {}
