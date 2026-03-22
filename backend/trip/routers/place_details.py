"""CRUD router for PlaceDetails (one-to-one extension of Place)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import PlaceDetails
from ..models.models import Place

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
# Helpers
# ---------------------------------------------------------------------------


def _get_owned_place(session, place_id: int, current_user: str) -> Place:
    """Return the Place if it exists and belongs to current_user, else 404/403."""
    place = session.get(Place, place_id)
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    if place.user != current_user:
        raise HTTPException(status_code=403, detail="Forbidden")
    return place


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
    _get_owned_place(session, place_id, current_user)

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
    _get_owned_place(session, place_id, current_user)

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
    _get_owned_place(session, place_id, current_user)

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
    _get_owned_place(session, place_id, current_user)

    details = session.exec(
        select(PlaceDetails).where(PlaceDetails.place_id == place_id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Details not found")

    session.delete(details)
    session.commit()
