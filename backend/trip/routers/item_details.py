"""CRUD router for TripItemDetails (one-to-one extension of TripItem)."""

from enum import Enum
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import TripItemDetails
from ..models.models import Trip, TripDay, TripItem

router = APIRouter(prefix="/api/trips", tags=["trip-item-details"])


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------

PRIORITY_VALUES = Literal["must-see", "should-see", "nice-to-have"]


class TripItemDetailsCreate(BaseModel):
    confirmation_code: str | None = None
    priority: PRIORITY_VALUES | None = None
    duration_minutes: int | None = None
    alternative_item_id: int | None = None
    alternative_reason: str | None = None


class TripItemDetailsUpdate(BaseModel):
    confirmation_code: str | None = None
    priority: PRIORITY_VALUES | None = None
    duration_minutes: int | None = None
    alternative_item_id: int | None = None
    alternative_reason: str | None = None


class TripItemDetailsRead(BaseModel):
    id: int
    item_id: int
    confirmation_code: str | None = None
    priority: str | None = None
    duration_minutes: int | None = None
    alternative_item_id: int | None = None
    alternative_reason: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _verify_trip_and_item(
    session, trip_id: int, item_id: int, current_user: str
) -> TripItem:
    """Verify trip ownership AND that the item belongs to the trip.

    The ownership chain is: Trip -> TripDay -> TripItem.
    """
    trip = session.get(Trip, trip_id)
    if not trip or trip.user != current_user:
        raise HTTPException(status_code=404, detail="Trip not found")

    item = session.get(TripItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Verify item belongs to this trip via its day
    day = session.get(TripDay, item.day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Item not found in this trip")

    return item


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{trip_id}/items/{item_id}/details",
    response_model=TripItemDetailsRead,
    status_code=201,
)
def create_item_details(
    trip_id: int,
    item_id: int,
    body: TripItemDetailsCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    item = _verify_trip_and_item(session, trip_id, item_id, current_user)

    existing = session.exec(
        select(TripItemDetails).where(TripItemDetails.item_id == item.id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="Details already exist for this item"
        )

    details = TripItemDetails(item_id=item.id, **body.model_dump())
    session.add(details)
    session.commit()
    session.refresh(details)
    return details


@router.get(
    "/{trip_id}/items/{item_id}/details",
    response_model=TripItemDetailsRead,
)
def get_item_details(
    trip_id: int,
    item_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    item = _verify_trip_and_item(session, trip_id, item_id, current_user)

    details = session.exec(
        select(TripItemDetails).where(TripItemDetails.item_id == item.id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Details not found")
    return details


@router.put(
    "/{trip_id}/items/{item_id}/details",
    response_model=TripItemDetailsRead,
)
def update_item_details(
    trip_id: int,
    item_id: int,
    body: TripItemDetailsUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    item = _verify_trip_and_item(session, trip_id, item_id, current_user)

    details = session.exec(
        select(TripItemDetails).where(TripItemDetails.item_id == item.id)
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


@router.delete(
    "/{trip_id}/items/{item_id}/details",
    status_code=204,
)
def delete_item_details(
    trip_id: int,
    item_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    item = _verify_trip_and_item(session, trip_id, item_id, current_user)

    details = session.exec(
        select(TripItemDetails).where(TripItemDetails.item_id == item.id)
    ).first()
    if not details:
        raise HTTPException(status_code=404, detail="Details not found")

    session.delete(details)
    session.commit()
