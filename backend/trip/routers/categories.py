from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import func, select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Category, CategoryCreate, CategoryRead,
                             CategoryUpdate, Image, Place)
from ..security import verify_exists_and_owns
from ..utils.utils import b64img_decode, save_image_to_file

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def read_categories(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[Category]:
    db_categories = session.exec(
        select(Category).options(selectinload(Category.image)).where(Category.user == current_user)
    ).all()
    return [CategoryRead.serialize(category) for category in db_categories]


@router.post("", response_model=CategoryRead)
def post_category(
    category: CategoryCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> CategoryRead:
    new_category = Category(name=category.name, color=category.color, user=current_user)

    if category.image:
        image_bytes = b64img_decode(category.image)
        filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.commit()
        session.refresh(image)
        new_category.image_id = image.id

    session.add(new_category)
    session.commit()
    session.refresh(new_category)
    return CategoryRead.serialize(new_category)


@router.put("/{category_id}", response_model=CategoryRead)
def update_category(
    session: SessionDep,
    category_id: int,
    category: CategoryUpdate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> CategoryRead:
    db_category = session.get(Category, category_id)
    verify_exists_and_owns(current_user, db_category)

    category_data = category.model_dump(exclude_unset=True)
    category_image = category_data.pop("image", None)
    if category_image:
        try:
            image_bytes = b64img_decode(category_image)
        except Exception:
            raise HTTPException(status_code=400, detail="Bad request")

        filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.commit()
        session.refresh(image)

        if db_category.image_id:
            old_image = session.get(Image, db_category.image_id)
            try:
                session.delete(old_image)
                db_category.image_id = None
                session.refresh(db_category)
            except Exception:
                raise HTTPException(status_code=400, detail="Bad request")

        db_category.image_id = image.id

    for key, value in category_data.items():
        setattr(db_category, key, value)

    session.add(db_category)
    session.commit()
    session.refresh(db_category)
    return CategoryRead.serialize(db_category)


@router.delete("/{category_id}")
def delete_category(
    session: SessionDep,
    category_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> dict:
    db_category = session.get(Category, category_id)
    verify_exists_and_owns(current_user, db_category)

    places_count = session.exec(
        select(func.count(Place.id)).where(Place.category_id == category_id, Place.user == current_user)
    ).one()

    if places_count > 0:
        raise HTTPException(status_code=409, detail="The resource is not orphan")

    if db_category.image:
        try:
            session.delete(db_category.image)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Roses are red, violets are blue, if you're reading this, I'm sorry for you",
            )

    session.delete(db_category)
    session.commit()
    return {}
