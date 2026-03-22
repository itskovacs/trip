"""CRUD router for PlaceDetails (one-to-one extension of Place)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import PlaceDetails
from ._helpers import verify_place_ownership

router = APIRouter(prefix="/api/places", tags=["place-details"])


# ---------------------------------------------------------------------------
# Pydantic request / response schemas (intentionally separate from DB model)
# ---------------------------------------------------------------------------


class PlaceDetailsCreate(BaseModel):
    opening_hours: dict | None = None
    rating: float | None = Field(default=None, ge=1.0, le=5.0)
    photos: list | None = None
    tips: str | None = None
    links: list | None = None
    subcategory: str | None = None
    address: str | None = None
    contact_phone: str | None = None
    contact_website: str | None = None
    contact_email: str | None = None


class PlaceDetailsUpdate(BaseModel):
    opening_hours: dict | None = None
    rating: float | None = Field(default=None, ge=1.0, le=5.0)
    photos: list | None = None
    tips: str | None = None
    links: list | None = None
    subcategory: str | None = None
    address: str | None = None
    contact_phone: str | None = None
    contact_website: str | None = None
    contact_email: str | None = None


class PlaceDetailsRead(BaseModel):
    id: int
    place_id: int
    opening_hours: dict | None = None
    rating: float | None = None
    photos: list | None = None
    tips: str | None = None
    links: list | None = None
    subcategory: str | None = None
    address: str | None = None
    contact_phone: str | None = None
    contact_website: str | None = None
    contact_email: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/{place_id}/details", response_model=PlaceDetailsRead, status_code=201)
def create_place_details(
    place_id: int,
    body: PlaceDetailsCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    existing = session.exec(
        select(PlaceDetails).where(PlaceDetails.place_id == place_id)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Details already exist for this place")

    details = PlaceDetails(place_id=place_id, **body.model_dump())
    session.add(details)
    session.commit()
    session.refresh(details)
    return details


@router.get("/{place_id}/details", response_model=PlaceDetailsRead)
def get_place_details(
    place_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    details = session.exec(
        select(PlaceDetails).where(PlaceDetails.place_id == place_id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Details not found")
    return details


@router.put("/{place_id}/details", response_model=PlaceDetailsRead)
def update_place_details(
    place_id: int,
    body: PlaceDetailsUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    details = session.exec(
        select(PlaceDetails).where(PlaceDetails.place_id == place_id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Details not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(details, key, value)

    session.add(details)
    session.commit()
    session.refresh(details)
    return details


@router.delete("/{place_id}/details", status_code=204)
def delete_place_details(
    place_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_place_ownership(session, place_id, current_user)

    details = session.exec(
        select(PlaceDetails).where(PlaceDetails.place_id == place_id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Details not found")

    session.delete(details)
    session.commit()
