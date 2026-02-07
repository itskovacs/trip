from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep
from ..models.models import (Category, CategoryRead, Image, Place, PlaceCreate,
                             PlaceRead, TokenGoogleSearch, TokenPlaceCreate)
from ..security import api_token_to_user
from ..utils.utils import (b64img_decode, download_file, patch_image,
                           save_image_to_file)
from .places import create_place
from .providers import bulk_to_places, google_resolve_shortlink, text_search

router = APIRouter(prefix="/api/by_token", tags=["by_token"])


@router.post("/place", response_model=PlaceRead)
async def token_create_place(
    place: TokenPlaceCreate,
    session: SessionDep,
    X_Api_Token: Annotated[str | None, Header()] = None,
) -> PlaceRead:
    db_user = api_token_to_user(session, X_Api_Token)
    current_user = db_user.username
    category = session.exec(
        select(Category).where(Category.user == current_user, Category.name == place.category)
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


@router.get("/categories", response_model=list[CategoryRead])
def token_read_categories(
    session: SessionDep, X_Api_Token: Annotated[str | None, Header()] = None
) -> list[CategoryRead]:
    db_user = api_token_to_user(session, X_Api_Token)
    db_categories = session.exec(select(Category).where(Category.user == db_user.username)).all()
    return [CategoryRead.serialize(category) for category in db_categories]


@router.post("/google-search")
async def token_google_search(
    data: TokenGoogleSearch, session: SessionDep, X_Api_Token: Annotated[str | None, Header()] = None
) -> PlaceRead:
    db_user = api_token_to_user(session, X_Api_Token)
    current_user = db_user.username

    try:
        query = data.q
        if "maps.app.goo.gl" in query:
            result = await google_resolve_shortlink(query.split("/")[-1], session, current_user)
        elif "google.com/maps/place/" in query:
            results = await bulk_to_places([query], session, current_user)
            result = results[0]
        else:
            results = await text_search(data.q, session, current_user)
            result = results[0]
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")

    category_name = result.category or data.category
    if not category_name:
        raise HTTPException(status_code=400, detail="Category not set")

    category = session.exec(
        select(Category).where(Category.user == current_user, Category.name == category_name)
    ).first()
    if not category:
        raise HTTPException(status_code=400, detail="Bad Request, unknown Category")

    place_create = PlaceCreate(**result.model_dump(), category_id=category.id)
    return await create_place(place_create, session, current_user)
