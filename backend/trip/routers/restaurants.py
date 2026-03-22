"""CRUD router for RestaurantDetails and Dishes (extensions of Place)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import Dish, RestaurantDetails
from ._helpers import verify_place_ownership

router = APIRouter(prefix="/api/places", tags=["restaurants"])


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------


class RestaurantCreate(BaseModel):
    cuisine: str | None = None
    price_range: str | None = None
    reservation_required: bool | None = None
    must_try: bool | None = None


class RestaurantUpdate(BaseModel):
    cuisine: str | None = None
    price_range: str | None = None
    reservation_required: bool | None = None
    must_try: bool | None = None


class RestaurantRead(BaseModel):
    id: int
    place_id: int
    cuisine: str | None = None
    price_range: str | None = None
    reservation_required: bool | None = None
    must_try: bool | None = None


class DishCreate(BaseModel):
    name: str
    price: float | None = None
    description: str | None = None


class DishRead(BaseModel):
    id: int
    place_id: int
    name: str
    price: float | None = None
    description: str | None = None


# ---------------------------------------------------------------------------
# RestaurantDetails endpoints
# ---------------------------------------------------------------------------


@router.post("/{place_id}/restaurant", response_model=RestaurantRead, status_code=201)
def create_restaurant(
    place_id: int,
    body: RestaurantCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    existing = session.exec(
        select(RestaurantDetails).where(RestaurantDetails.place_id == place_id)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Restaurant details already exist for this place")

    details = RestaurantDetails(place_id=place_id, **body.model_dump())
    session.add(details)
    session.commit()
    session.refresh(details)
    return details


@router.get("/{place_id}/restaurant", response_model=RestaurantRead)
def get_restaurant(
    place_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    details = session.exec(
        select(RestaurantDetails).where(RestaurantDetails.place_id == place_id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Restaurant details not found")
    return details


@router.put("/{place_id}/restaurant", response_model=RestaurantRead)
def update_restaurant(
    place_id: int,
    body: RestaurantUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    details = session.exec(
        select(RestaurantDetails).where(RestaurantDetails.place_id == place_id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Restaurant details not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(details, key, value)

    session.add(details)
    session.commit()
    session.refresh(details)
    return details


@router.delete("/{place_id}/restaurant", status_code=204)
def delete_restaurant(
    place_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    details = session.exec(
        select(RestaurantDetails).where(RestaurantDetails.place_id == place_id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Restaurant details not found")

    session.delete(details)
    session.commit()


# ---------------------------------------------------------------------------
# Dish endpoints
# ---------------------------------------------------------------------------


@router.post("/{place_id}/restaurant/dishes", response_model=DishRead, status_code=201)
def create_dish(
    place_id: int,
    body: DishCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    dish = Dish(place_id=place_id, **body.model_dump())
    session.add(dish)
    session.commit()
    session.refresh(dish)
    return dish


@router.get("/{place_id}/restaurant/dishes", response_model=list[DishRead])
def list_dishes(
    place_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    dishes = session.exec(
        select(Dish).where(Dish.place_id == place_id)
    ).all()
    return dishes


@router.delete("/{place_id}/restaurant/dishes/{dish_id}", status_code=204)
def delete_dish(
    place_id: int,
    dish_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    dish = session.get(Dish, dish_id)
    if not dish or dish.place_id != place_id:
        raise HTTPException(status_code=404, detail="Dish not found")

    session.delete(dish)
    session.commit()
