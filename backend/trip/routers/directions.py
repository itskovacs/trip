"""Google Maps directions export – build multi-stop URLs from trip-day items."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.models import Place, Trip, TripDay, TripItem
from ._helpers import verify_trip_ownership

router = APIRouter(prefix="/api/trips", tags=["directions"])


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class DirectionStop(BaseModel):
    name: str
    lat: float
    lng: float
    time: str


class DayDirectionsResponse(BaseModel):
    google_maps_url: str
    stops: list[DirectionStop]
    stop_count: int


class TripDayDirectionsSummary(BaseModel):
    day_id: int
    label: str
    date: str | None
    google_maps_url: str
    stop_count: int


class TripDirectionsResponse(BaseModel):
    days: list[TripDayDirectionsSummary]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_stops(items: list[TripItem]) -> list[DirectionStop]:
    """Return sorted stops for items that have coordinates."""
    stops: list[DirectionStop] = []
    for item in sorted(items, key=lambda i: i.time):
        # Prefer linked Place coordinates; fall back to item's own lat/lng
        if item.place and item.place.lat is not None and item.place.lng is not None:
            lat, lng, name = item.place.lat, item.place.lng, item.place.name
        elif item.lat is not None and item.lng is not None:
            lat, lng, name = item.lat, item.lng, item.text
        else:
            continue
        stops.append(DirectionStop(name=name, lat=lat, lng=lng, time=item.time))
    return stops


def _build_url(stops: list[DirectionStop]) -> str:
    if not stops:
        return ""
    parts = "/".join(f"{s.lat},{s.lng}" for s in stops)
    return f"https://www.google.com/maps/dir/{parts}"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{trip_id}/days/{day_id}/directions", response_model=DayDirectionsResponse)
def get_day_directions(
    trip_id: int,
    day_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> DayDirectionsResponse:
    verify_trip_ownership(session, trip_id, current_user)

    day = session.exec(
        select(TripDay)
        .where(TripDay.id == day_id, TripDay.trip_id == trip_id)
        .options(selectinload(TripDay.items).selectinload(TripItem.place))  # type: ignore[arg-type]
    ).first()
    if not day:
        raise HTTPException(status_code=404, detail="Not found")

    stops = _build_stops(day.items)
    return DayDirectionsResponse(
        google_maps_url=_build_url(stops),
        stops=stops,
        stop_count=len(stops),
    )


@router.get("/{trip_id}/directions", response_model=TripDirectionsResponse)
def get_trip_directions(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripDirectionsResponse:
    trip = verify_trip_ownership(session, trip_id, current_user)

    # Eagerly load days -> items -> place
    trip = session.exec(
        select(Trip)
        .where(Trip.id == trip_id)
        .options(
            selectinload(Trip.days)  # type: ignore[arg-type]
            .selectinload(TripDay.items)  # type: ignore[arg-type]
            .selectinload(TripItem.place)  # type: ignore[arg-type]
        )
    ).first()

    summaries: list[TripDayDirectionsSummary] = []
    for day in trip.days:
        stops = _build_stops(day.items)
        summaries.append(
            TripDayDirectionsSummary(
                day_id=day.id,
                label=day.label,
                date=str(day.dt) if day.dt else None,
                google_maps_url=_build_url(stops),
                stop_count=len(stops),
            )
        )

    return TripDirectionsResponse(days=summaries)
