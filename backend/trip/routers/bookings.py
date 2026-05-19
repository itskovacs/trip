from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.models import (Trip, TripBooking, TripBookingCreate,
                             TripBookingRead, TripBookingUpdate, TripDay,
                             TripMember)

router = APIRouter(prefix="/api", tags=["bookings"])


def _get_verified_trip(session, trip_id: int, username: str) -> Trip:
    trip = session.exec(
        select(Trip)
        .outerjoin(TripMember)
        .where(
            Trip.id == trip_id,
            (Trip.user == username) | ((TripMember.user == username) & (TripMember.joined_at.is_not(None))),
        )
    ).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Not found")
    return trip


@router.post("/trips/{trip_id}/days/{day_id}/bookings", response_model=TripBookingRead)
def create_booking(
    trip_id: int,
    day_id: int,
    booking: TripBookingCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripBookingRead:
    trip = _get_verified_trip(session, trip_id, current_user)
    if trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    day = session.get(TripDay, day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Not found")

    db_booking = TripBooking(**booking.model_dump(), day_id=day_id, trip_id=trip_id)
    session.add(db_booking)
    session.commit()
    session.refresh(db_booking)
    return TripBookingRead.model_validate(db_booking)


@router.put("/bookings/{booking_id}", response_model=TripBookingRead)
def update_booking(
    booking_id: int,
    booking: TripBookingUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripBookingRead:
    db_booking = session.get(TripBooking, booking_id)
    if not db_booking:
        raise HTTPException(status_code=404, detail="Not found")

    _get_verified_trip(session, db_booking.trip_id, current_user)

    for key, value in booking.model_dump().items():
        setattr(db_booking, key, value)

    session.commit()
    session.refresh(db_booking)
    return TripBookingRead.model_validate(db_booking)


@router.delete("/bookings/{booking_id}")
def delete_booking(
    booking_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> None:
    db_booking = session.get(TripBooking, booking_id)
    if not db_booking:
        raise HTTPException(status_code=404, detail="Not found")

    _get_verified_trip(session, db_booking.trip_id, current_user)

    session.delete(db_booking)
    session.commit()
