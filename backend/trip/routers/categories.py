from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Category, CategoryCreate, CategoryRead,
                             CategoryUpdate, Image)
from ..security import verify_exists_and_owns
from ..utils.utils import b64img_decode, remove_image, save_image_to_file

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def read_categories(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[Category]:
    categories = session.exec(select(Category).filter(Category.user == current_user))
    return [CategoryRead.serialize(category) for category in categories]


@router.post("", response_model=CategoryRead)
def post_category(
    category: CategoryCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> CategoryRead:
    new_category = Category(name=category.name, user=current_user)

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
def put_category(
    session: SessionDep,
    category_id: int,
    category: CategoryUpdate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> CategoryRead:
    db_category = session.get(Category, category_id)
    verify_exists_and_owns(current_user, db_category)

    category_data = category.model_dump(exclude_unset=True)
    if category_data.get("image"):
        try:
            image_bytes = b64img_decode(category_data.pop("image"))
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
                remove_image(old_image.filename)
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

    if get_category_placess_cnt(session, category_id, current_user) > 0:
        raise HTTPException(status_code=409, detail="The resource is not orphan")

    session.delete(db_category)
    session.commit()
    return {}


@router.get("/{category_id}/count")
def get_category_placess_cnt(
    session: SessionDep,
    category_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> int:
    db_category = session.get(Category, category_id)
    verify_exists_and_owns(current_user, db_category)
    return len(db_category.places)
