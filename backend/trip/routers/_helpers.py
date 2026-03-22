"""Shared helper functions for extension routers."""
from fastapi import HTTPException
from sqlmodel import select
from sqlalchemy.orm import selectinload

from ..models.models import Trip, TripDay, TripItem, TripMember, Place


def verify_trip_ownership(session, trip_id: int, username: str) -> Trip:
    """Verify the trip exists and belongs to the user (owner or member)."""
    trip = session.exec(
        select(Trip)
        .outerjoin(TripMember)
        .where(
            Trip.id == trip_id,
            (Trip.user == username) | ((TripMember.user == username) & (TripMember.joined_at.is_not(None))),
        )
    ).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def verify_place_ownership(session, place_id: int, username: str) -> Place:
    """Verify the place exists and belongs to the user."""
    place = session.exec(select(Place).where(Place.id == place_id, Place.user == username)).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return place


def verify_day_in_trip(session, day_id: int, trip_id: int) -> TripDay:
    """Verify the day exists and belongs to the trip."""
    day = session.exec(select(TripDay).where(TripDay.id == day_id, TripDay.trip_id == trip_id)).first()
    if not day:
        raise HTTPException(status_code=404, detail="Day not found in trip")
    return day


def verify_item_in_trip(session, item_id: int, trip_id: int) -> TripItem:
    """Verify the item belongs to a day in the trip."""
    item = session.exec(
        select(TripItem)
        .join(TripDay, TripItem.day_id == TripDay.id)
        .where(TripItem.id == item_id, TripDay.trip_id == trip_id)
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in trip")
    return item
