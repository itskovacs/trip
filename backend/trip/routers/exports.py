"""Calendar export, route optimization, and cost settlement endpoints."""

from math import atan2, cos, radians, sin, sqrt
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.models import Place, Trip, TripDay, TripItem, TripMember

router = APIRouter(prefix="/api/trips", tags=["exports"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _verify_trip(session, trip_id: int, current_user: str) -> Trip:
    """Verify trip exists and is owned by the current user."""
    trip = session.get(Trip, trip_id)
    if not trip or trip.user != current_user:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in km between two lat/lng points."""
    R = 6371  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _total_distance(points: list[dict]) -> float:
    """Sum of haversine distances along a sequence of points."""
    total = 0.0
    for i in range(len(points) - 1):
        total += haversine(
            points[i]["lat"], points[i]["lng"],
            points[i + 1]["lat"], points[i + 1]["lng"],
        )
    return round(total, 2)


def _add_hours(time_str: str, hours: int) -> str:
    """Add hours to a HH:MM time string, returning HH:MM (clamped to 23:59)."""
    parts = time_str.split(":")
    h = int(parts[0]) + hours
    m = int(parts[1]) if len(parts) > 1 else 0
    if h > 23:
        h = 23
        m = 59
    return f"{h:02d}{m:02d}"


# ---------------------------------------------------------------------------
# Endpoint 1: Calendar Export (.ics)
# ---------------------------------------------------------------------------


@router.get("/{trip_id}/export/ical")
def export_ical(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    trip = _verify_trip(session, trip_id, current_user)

    # Eagerly load days and their items
    days = session.exec(
        select(TripDay).where(TripDay.trip_id == trip_id)
    ).all()

    ical = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TravelThing//EN\r\n"

    for day in days:
        items = session.exec(
            select(TripItem).where(TripItem.day_id == day.id)
        ).all()

        # Eagerly load places for items that have place_id
        for item in items:
            if item.place_id:
                item.place = session.get(Place, item.place_id)

        if day.dt:
            dt_str = day.dt.strftime("%Y%m%d") if hasattr(day.dt, "strftime") else str(day.dt).replace("-", "")

            if items:
                # Each item becomes a timed event
                for item in items:
                    ical += "BEGIN:VEVENT\r\n"
                    start_time = item.time.replace(":", "")
                    ical += f"DTSTART:{dt_str}T{start_time}00\r\n"
                    end_time = _add_hours(item.time, 1)
                    ical += f"DTEND:{dt_str}T{end_time}00\r\n"
                    ical += f"SUMMARY:{item.text}\r\n"
                    if item.place:
                        ical += f"LOCATION:{item.place.place}\r\n"
                    if item.price is not None:
                        ical += f"DESCRIPTION:{item.price}\r\n"
                    ical += "END:VEVENT\r\n"
            else:
                # Day with date but no items -> all-day event
                ical += "BEGIN:VEVENT\r\n"
                ical += f"DTSTART;VALUE=DATE:{dt_str}\r\n"
                ical += f"SUMMARY:{day.label}\r\n"
                ical += "END:VEVENT\r\n"

    ical += "END:VCALENDAR\r\n"

    return Response(
        content=ical,
        media_type="text/calendar",
        headers={"Content-Disposition": f"attachment; filename={trip.name}.ics"},
    )


# ---------------------------------------------------------------------------
# Endpoint 2: Route Optimization
# ---------------------------------------------------------------------------


class OptimizePointRead(BaseModel):
    id: int
    name: str
    lat: float
    lng: float


class OptimizeResponse(BaseModel):
    original_order: list[OptimizePointRead]
    optimized_order: list[OptimizePointRead]
    original_distance_km: float
    optimized_distance_km: float
    savings_km: float


@router.post("/{trip_id}/days/{day_id}/optimize", response_model=OptimizeResponse)
def optimize_route(
    trip_id: int,
    day_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)

    # Verify day belongs to this trip
    day = session.get(TripDay, day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Day not found")

    items = session.exec(
        select(TripItem).where(TripItem.day_id == day_id).order_by(TripItem.time)
    ).all()

    # Build list of geolocated points
    points: list[dict] = []
    for item in items:
        lat = item.lat
        lng = item.lng
        if lat is None or lng is None:
            # Fall back to linked place
            if item.place_id:
                place = session.get(Place, item.place_id)
                if place:
                    lat = place.lat
                    lng = place.lng
        if lat is not None and lng is not None:
            points.append({"id": item.id, "name": item.text, "lat": lat, "lng": lng})

    if len(points) < 2:
        return OptimizeResponse(
            original_order=[OptimizePointRead(**p) for p in points],
            optimized_order=[OptimizePointRead(**p) for p in points],
            original_distance_km=0.0,
            optimized_distance_km=0.0,
            savings_km=0.0,
        )

    # Nearest-neighbor algorithm starting from the first point
    optimized: list[dict] = [points[0]]
    remaining = list(points[1:])
    while remaining:
        current = optimized[-1]
        nearest = min(
            remaining,
            key=lambda p: haversine(current["lat"], current["lng"], p["lat"], p["lng"]),
        )
        optimized.append(nearest)
        remaining.remove(nearest)

    original_dist = _total_distance(points)
    optimized_dist = _total_distance(optimized)

    return OptimizeResponse(
        original_order=[OptimizePointRead(**p) for p in points],
        optimized_order=[OptimizePointRead(**p) for p in optimized],
        original_distance_km=original_dist,
        optimized_distance_km=optimized_dist,
        savings_km=round(original_dist - optimized_dist, 2),
    )


# ---------------------------------------------------------------------------
# Endpoint 3: Cost Settlement
# ---------------------------------------------------------------------------


class SettlementTransfer(BaseModel):
    from_user: str  # serialized as "from" in JSON
    to: str
    amount: float

    model_config = {"populate_by_name": True}

    def model_dump(self, **kwargs):
        d = super().model_dump(**kwargs)
        d["from"] = d.pop("from_user")
        return d


class SettlementResponse(BaseModel):
    total_cost: float
    currency: str
    members: list[str]
    per_person: float
    balances: dict[str, float]
    settlements: list[dict]


@router.get("/{trip_id}/settlement")
def get_settlement(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    trip = _verify_trip(session, trip_id, current_user)

    # Gather all members: owner + joined TripMembers
    member_rows = session.exec(
        select(TripMember).where(
            TripMember.trip_id == trip_id,
            TripMember.joined_at.is_not(None),
        )
    ).all()
    members = [trip.user] + [m.user for m in member_rows]

    # Get all items with price and paid_by
    days = session.exec(select(TripDay).where(TripDay.trip_id == trip_id)).all()
    day_ids = [d.id for d in days]

    paid_items: list[TripItem] = []
    if day_ids:
        paid_items = list(
            session.exec(
                select(TripItem).where(
                    TripItem.day_id.in_(day_ids),
                    TripItem.price.is_not(None),
                    TripItem.paid_by.is_not(None),
                )
            ).all()
        )

    total_cost = sum(item.price for item in paid_items)
    num_members = len(members)
    per_person = round(total_cost / num_members, 2) if num_members > 0 else 0.0

    # Calculate how much each person paid
    paid_amounts: dict[str, float] = {m: 0.0 for m in members}
    for item in paid_items:
        if item.paid_by in paid_amounts:
            paid_amounts[item.paid_by] += item.price

    # Net balance: paid - owes
    balances: dict[str, float] = {
        m: round(paid_amounts[m] - per_person, 2) for m in members
    }

    # Generate settlement transfers (simplified: debtors pay creditors)
    settlements: list[dict] = []
    debtors = sorted(
        [(m, -balances[m]) for m in members if balances[m] < 0],
        key=lambda x: x[1],
        reverse=True,
    )
    creditors = sorted(
        [(m, balances[m]) for m in members if balances[m] > 0],
        key=lambda x: x[1],
        reverse=True,
    )

    d_idx, c_idx = 0, 0
    while d_idx < len(debtors) and c_idx < len(creditors):
        debtor, debt = debtors[d_idx]
        creditor, credit = creditors[c_idx]
        transfer = round(min(debt, credit), 2)
        if transfer > 0:
            settlements.append({
                "from": debtor,
                "to": creditor,
                "amount": transfer,
            })
        debtors[d_idx] = (debtor, round(debt - transfer, 2))
        creditors[c_idx] = (creditor, round(credit - transfer, 2))
        if debtors[d_idx][1] <= 0:
            d_idx += 1
        if creditors[c_idx][1] <= 0:
            c_idx += 1

    currency = trip.currency if trip.currency else "USD"

    return {
        "total_cost": total_cost,
        "currency": currency,
        "members": members,
        "per_person": per_person,
        "balances": balances,
        "settlements": settlements,
    }
