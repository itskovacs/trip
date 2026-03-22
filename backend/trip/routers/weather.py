"""CRUD router for day weather forecasts (one-to-one extension of TripDay)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import DayWeather
from ..models.models import Trip, TripDay

router = APIRouter(prefix="/api/trips", tags=["weather"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _verify_trip_and_day(
    session, trip_id: int, day_id: int, current_user: str
) -> TripDay:
    """Verify trip ownership AND that the day belongs to the trip."""
    trip = session.get(Trip, trip_id)
    if not trip or trip.user != current_user:
        raise HTTPException(status_code=404, detail="Trip not found")

    day = session.get(TripDay, day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Day not found in this trip")

    return day


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class WeatherCreate(BaseModel):
    high_temp: float | None = None
    low_temp: float | None = None
    condition: str | None = None
    rain_chance: int | None = None


class WeatherUpdate(BaseModel):
    high_temp: float | None = None
    low_temp: float | None = None
    condition: str | None = None
    rain_chance: int | None = None


class WeatherRead(BaseModel):
    id: int
    day_id: int
    high_temp: float | None = None
    low_temp: float | None = None
    condition: str | None = None
    rain_chance: int | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{trip_id}/days/{day_id}/weather",
    response_model=WeatherRead,
    status_code=201,
)
def create_weather(
    trip_id: int,
    day_id: int,
    body: WeatherCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    day = _verify_trip_and_day(session, trip_id, day_id, current_user)

    existing = session.exec(
        select(DayWeather).where(DayWeather.day_id == day.id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="Weather already exists for this day"
        )

    weather = DayWeather(day_id=day.id, **body.model_dump())
    session.add(weather)
    session.commit()
    session.refresh(weather)
    return weather


@router.get(
    "/{trip_id}/days/{day_id}/weather",
    response_model=WeatherRead,
)
def get_weather(
    trip_id: int,
    day_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    day = _verify_trip_and_day(session, trip_id, day_id, current_user)

    weather = session.exec(
        select(DayWeather).where(DayWeather.day_id == day.id)
    ).first()
    if not weather:
        raise HTTPException(status_code=404, detail="Weather not found")
    return weather


@router.put(
    "/{trip_id}/days/{day_id}/weather",
    response_model=WeatherRead,
)
def update_weather(
    trip_id: int,
    day_id: int,
    body: WeatherUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    day = _verify_trip_and_day(session, trip_id, day_id, current_user)

    weather = session.exec(
        select(DayWeather).where(DayWeather.day_id == day.id)
    ).first()
    if not weather:
        raise HTTPException(status_code=404, detail="Weather not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(weather, key, value)

    session.add(weather)
    session.commit()
    session.refresh(weather)
    return weather


@router.delete(
    "/{trip_id}/days/{day_id}/weather",
    status_code=204,
)
def delete_weather(
    trip_id: int,
    day_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    day = _verify_trip_and_day(session, trip_id, day_id, current_user)

    weather = session.exec(
        select(DayWeather).where(DayWeather.day_id == day.id)
    ).first()
    if not weather:
        raise HTTPException(status_code=404, detail="Weather not found")

    session.delete(weather)
    session.commit()
