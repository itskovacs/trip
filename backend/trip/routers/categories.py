from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import select

from ..config import get_settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Category, CategoryCreate, CategoryRead,
                             CategoryUpdate, Image, Place)
from ..security import verify_exists_and_owns
from ..utils.utils import b64img_decode, remove_image, save_image_to_file

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def read_categories(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[CategoryRead]:
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

    filename = None
    if category.image:
        image_bytes = b64img_decode(category.image)
        filename, file_size = save_image_to_file(image_bytes, get_settings().PLACE_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, file_size=file_size, user=current_user)
        session.add(image)
        session.flush()
        session.refresh(image)
        new_category.image_id = image.id

    try:
        session.add(new_category)
        session.commit()
    except Exception:
        session.rollback()
        if filename:
            remove_image(filename)
        raise HTTPException(status_code=500, detail="Failed to create")
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
    filename = None
    if category_image:
        image_bytes = b64img_decode(category_image)
        filename, file_size = save_image_to_file(image_bytes, get_settings().PLACE_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        if db_category.image:
            session.delete(db_category.image)
            session.flush()

        image = Image(filename=filename, file_size=file_size, user=current_user)
        session.add(image)
        session.flush()
        session.refresh(db_category)
        db_category.image_id = image.id

    for key, value in category_data.items():
        setattr(db_category, key, value)

    try:
        session.add(db_category)
        session.commit()
    except Exception:
        session.rollback()
        if filename:
            remove_image(filename)
        raise HTTPException(status_code=500, detail="Failed to update")
    return CategoryRead.serialize(db_category)


@router.delete("/{category_id}")
def delete_category(
    session: SessionDep,
    category_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> dict:
    db_category = session.exec(
        select(Category)
        .options(selectinload(Category.image), selectinload(Category.places).selectinload(Place.image))
        .where(Category.id == category_id)
    ).first()

    for place in db_category.places:
        if place.image:
            session.delete(place.image)

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
