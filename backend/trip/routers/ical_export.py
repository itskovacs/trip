"""Dynamic iCalendar (.ics) export for trips."""
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import selectinload
from sqlmodel import select
from ..deps import SessionDep, get_current_username
from ..models.models import Trip, TripDay, TripItem, TripMember, Place

router = APIRouter(prefix="/api/trips", tags=["export"])

def _verify_trip(session, trip_id, username):
    trip = session.exec(select(Trip).outerjoin(TripMember).where(
        Trip.id == trip_id,
        (Trip.user == username) | ((TripMember.user == username) & (TripMember.joined_at.is_not(None)))
    )).first()
    if not trip: raise HTTPException(status_code=404, detail="Trip not found")
    return trip

def _add_hours(dt_str, time_str, hours=1):
    h, m = int(time_str[:2]), int(time_str[3:5])
    h += hours
    if h >= 24: h = 23; m = 59
    return f"{dt_str}T{h:02d}{m:02d}00"

@router.get("/{trip_id}/export/ical")
def export_ical(trip_id: int, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    _verify_trip(session, trip_id, current_user)
    trip = session.exec(
        select(Trip).options(
            selectinload(Trip.days).selectinload(TripDay.items).selectinload(TripItem.place),
        ).where(Trip.id == trip_id)
    ).first()

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TravelThing//EN", f"X-WR-CALNAME:{trip.name}"]

    for day in sorted(trip.days, key=lambda d: str(d.dt or "")):
        if not day.dt: continue
        dt = str(day.dt).replace("-", "")
        items = sorted(day.items, key=lambda i: i.time or "")

        if not items:
            lines += ["BEGIN:VEVENT", f"DTSTART;VALUE=DATE:{dt}", f"DTEND;VALUE=DATE:{dt}", f"SUMMARY:{day.label or 'Trip Day'}", "END:VEVENT"]
            continue

        for item in items:
            if not item.time: continue
            start = f"{dt}T{item.time.replace(':', '')}00"
            end = _add_hours(dt, item.time)
            summary = item.text or "Activity"
            location = item.place.name if item.place else ""
            desc = f"{item.price} {trip.currency}" if item.price else ""
            lines += ["BEGIN:VEVENT", f"DTSTART:{start}", f"DTEND:{end}", f"SUMMARY:{summary}"]
            if location: lines.append(f"LOCATION:{location}")
            if desc: lines.append(f"DESCRIPTION:{desc}")
            lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    content = "\r\n".join(lines) + "\r\n"
    filename = trip.name.replace(" ", "_") + ".ics"
    return Response(content=content, media_type="text/calendar",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})
