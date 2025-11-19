from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep
from ..models.models import Category, Image, Place, PlaceCreate, PlaceRead
from ..security import api_token_to_user
from ..utils.utils import (b64img_decode, download_file, patch_image,
                           save_image_to_file)

router = APIRouter(prefix="/api/by_token", tags=["by_token"])


@router.post("/place", response_model=PlaceRead)
async def create_place(
    place: PlaceCreate,
    session: SessionDep,
    X_Api_Token: Annotated[str | None, Header()] = None,
) -> PlaceRead:
    db_user = api_token_to_user(session, X_Api_Token)
    current_user = db_user.username

    category_name = place.category
    category = session.exec(
        select(Category).where(Category.user == current_user, Category.name == category_name)
    ).first()
    if not category:
        raise HTTPException(status_code=400, detail="Bad Request, unknown Category")

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
