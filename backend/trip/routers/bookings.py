from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.models import (Trip, TripAttachment, TripBooking,
                             TripBookingCreate, TripBookingRead,
                             TripBookingUpdate, TripDay, TripMember)

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

    booking_data = booking.model_dump()
    attachment_ids = booking_data.pop("attachment_ids")

    db_booking = TripBooking(**booking_data, day_id=day_id, trip_id=trip_id)

    if attachment_ids:
        attachments = session.exec(
            select(TripAttachment)
            .where(TripAttachment.id.in_(attachment_ids))
            .where(TripAttachment.trip_id == trip_id)
        ).all()
        if len(attachments) != len(attachment_ids):
            raise HTTPException(status_code=400, detail="One or more attachments not found in trip")
        db_booking.attachments = list(attachments)

    session.add(db_booking)
    session.commit()
    session.refresh(db_booking)
    return TripBookingRead.serialize(db_booking)


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

    trip = _get_verified_trip(session, db_booking.trip_id, current_user)
    if trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    booking_data = booking.model_dump(exclude_unset=True)

    attachment_ids = booking_data.pop("attachment_ids", None)
    if attachment_ids is not None:  # Could be empty [], so 'in'
        if attachment_ids:
            attachments = session.exec(
                select(TripAttachment)
                .where(TripAttachment.id.in_(attachment_ids))
                .where(TripAttachment.trip_id == db_booking.trip_id)
            ).all()
            if len(attachments) != len(attachment_ids):
                raise HTTPException(status_code=400, detail="One or more attachments not found in trip")
            db_booking.attachments = list(attachments)
        else:
            db_booking.attachments = []

    for key, value in booking_data.items():
        setattr(db_booking, key, value)

    session.commit()
    session.refresh(db_booking)
    return TripBookingRead.serialize(db_booking)


@router.delete("/bookings/{booking_id}")
def delete_booking(
    booking_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> None:
    db_booking = session.get(TripBooking, booking_id)
    if not db_booking:
        raise HTTPException(status_code=404, detail="Not found")

    trip = _get_verified_trip(session, db_booking.trip_id, current_user)
    if trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    session.delete(db_booking)
    session.commit()
