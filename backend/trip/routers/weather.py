"""CRUD router for day weather forecasts (one-to-one extension of TripDay)."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import DayWeather
from ._helpers import verify_trip_ownership, verify_day_in_trip

router = APIRouter(prefix="/api/trips", tags=["weather"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

WEATHER_CONDITIONS = Literal["sunny", "partly-cloudy", "cloudy", "rain", "snow", "storm"]


class WeatherCreate(BaseModel):
    high_temp: float | None = None
    low_temp: float | None = None
    condition: WEATHER_CONDITIONS | None = None
    rain_chance: int | None = None


class WeatherUpdate(BaseModel):
    high_temp: float | None = None
    low_temp: float | None = None
    condition: WEATHER_CONDITIONS | None = None
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
    verify_trip_ownership(session, trip_id, current_user)
    day = verify_day_in_trip(session, day_id, trip_id)

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
    verify_trip_ownership(session, trip_id, current_user)
    day = verify_day_in_trip(session, day_id, trip_id)

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
    verify_trip_ownership(session, trip_id, current_user)
    day = verify_day_in_trip(session, day_id, trip_id)

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
    verify_trip_ownership(session, trip_id, current_user)
    day = verify_day_in_trip(session, day_id, trip_id)

    weather = session.exec(
        select(DayWeather).where(DayWeather.day_id == day.id)
    ).first()
    if not weather:
        raise HTTPException(status_code=404, detail="Weather not found")

    session.delete(weather)
    session.commit()
