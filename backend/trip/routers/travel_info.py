"""CRUD router for trip travel info (one-to-one extension of Trip)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import TripTravelInfo
from ._helpers import verify_trip_ownership

router = APIRouter(prefix="/api/trips", tags=["travel-info"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class TravelInfoCreate(BaseModel):
    visa_required: bool | None = None
    visa_notes: str | None = None
    vaccinations: list | None = None
    insurance_required: bool | None = None
    insurance_notes: str | None = None
    embassy_name: str | None = None
    embassy_phone: str | None = None
    embassy_address: str | None = None
    local_emergency_number: str | None = None
    insurance_provider: str | None = None
    insurance_policy_number: str | None = None
    insurance_phone: str | None = None
    timezone: str | None = None
    general_notes: str | None = None


class TravelInfoUpdate(BaseModel):
    visa_required: bool | None = None
    visa_notes: str | None = None
    vaccinations: list | None = None
    insurance_required: bool | None = None
    insurance_notes: str | None = None
    embassy_name: str | None = None
    embassy_phone: str | None = None
    embassy_address: str | None = None
    local_emergency_number: str | None = None
    insurance_provider: str | None = None
    insurance_policy_number: str | None = None
    insurance_phone: str | None = None
    timezone: str | None = None
    general_notes: str | None = None


class TravelInfoRead(BaseModel):
    id: int
    trip_id: int
    visa_required: bool | None = None
    visa_notes: str | None = None
    vaccinations: list | None = None
    insurance_required: bool | None = None
    insurance_notes: str | None = None
    embassy_name: str | None = None
    embassy_phone: str | None = None
    embassy_address: str | None = None
    local_emergency_number: str | None = None
    insurance_provider: str | None = None
    insurance_policy_number: str | None = None
    insurance_phone: str | None = None
    timezone: str | None = None
    general_notes: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{trip_id}/travel-info",
    response_model=TravelInfoRead,
    status_code=201,
)
def create_travel_info(
    trip_id: int,
    body: TravelInfoCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)

    existing = session.exec(
        select(TripTravelInfo).where(TripTravelInfo.trip_id == trip_id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="Travel info already exists for this trip"
        )

    info = TripTravelInfo(trip_id=trip_id, **body.model_dump())
    session.add(info)
    session.commit()
    session.refresh(info)
    return info


@router.get(
    "/{trip_id}/travel-info",
    response_model=TravelInfoRead,
)
def get_travel_info(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)

    info = session.exec(
        select(TripTravelInfo).where(TripTravelInfo.trip_id == trip_id)
    ).first()
    if not info:
        raise HTTPException(status_code=404, detail="Travel info not found")
    return info


@router.put(
    "/{trip_id}/travel-info",
    response_model=TravelInfoRead,
)
def update_travel_info(
    trip_id: int,
    body: TravelInfoUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)

    info = session.exec(
        select(TripTravelInfo).where(TripTravelInfo.trip_id == trip_id)
    ).first()
    if not info:
        raise HTTPException(status_code=404, detail="Travel info not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(info, key, value)

    session.add(info)
    session.commit()
    session.refresh(info)
    return info


@router.delete(
    "/{trip_id}/travel-info",
    status_code=204,
)
def delete_travel_info(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)

    info = session.exec(
        select(TripTravelInfo).where(TripTravelInfo.trip_id == trip_id)
    ).first()
    if not info:
        raise HTTPException(status_code=404, detail="Travel info not found")

    session.delete(info)
    session.commit()
