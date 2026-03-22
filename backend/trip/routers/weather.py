"""Per-day weather forecast for trips."""
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select
from ..deps import SessionDep, get_current_username
from ..models.models import Trip, TripDay, TripMember
from ..models.extensions import DayWeather

router = APIRouter(prefix="/api/trips", tags=["weather"])

class WeatherCreate(BaseModel):
    high_temp: float | None = None
    low_temp: float | None = None
    condition: Literal["sunny", "partly-cloudy", "cloudy", "rain", "snow", "storm"] | None = None
    rain_chance: int | None = None

class WeatherUpdate(BaseModel):
    high_temp: float | None = None
    low_temp: float | None = None
    condition: Literal["sunny", "partly-cloudy", "cloudy", "rain", "snow", "storm"] | None = None
    rain_chance: int | None = None

class WeatherResponse(BaseModel):
    id: int
    day_id: int
    high_temp: float | None = None
    low_temp: float | None = None
    condition: str | None = None
    rain_chance: int | None = None
    model_config = {"from_attributes": True}

def _verify_trip(session, trip_id, username):
    trip = session.exec(select(Trip).outerjoin(TripMember).where(
        Trip.id == trip_id,
        (Trip.user == username) | ((TripMember.user == username) & (TripMember.joined_at.is_not(None)))
    )).first()
    if not trip: raise HTTPException(status_code=404, detail="Trip not found")
    return trip

def _verify_day(session, day_id, trip_id):
    day = session.exec(select(TripDay).where(TripDay.id == day_id, TripDay.trip_id == trip_id)).first()
    if not day: raise HTTPException(status_code=404, detail="Day not found")
    return day

@router.post("/{trip_id}/days/{day_id}/weather", response_model=WeatherResponse, status_code=status.HTTP_201_CREATED)
def create_weather(trip_id: int, day_id: int, data: WeatherCreate, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    _verify_trip(session, trip_id, current_user)
    _verify_day(session, day_id, trip_id)
    if session.exec(select(DayWeather).where(DayWeather.day_id == day_id)).first():
        raise HTTPException(status_code=409, detail="Weather already exists")
    w = DayWeather(day_id=day_id, **data.model_dump())
    session.add(w); session.commit(); session.refresh(w)
    return w

@router.get("/{trip_id}/days/{day_id}/weather", response_model=WeatherResponse)
def get_weather(trip_id: int, day_id: int, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    _verify_trip(session, trip_id, current_user)
    _verify_day(session, day_id, trip_id)
    w = session.exec(select(DayWeather).where(DayWeather.day_id == day_id)).first()
    if not w: raise HTTPException(status_code=404, detail="No weather data")
    return w

@router.put("/{trip_id}/days/{day_id}/weather", response_model=WeatherResponse)
def update_weather(trip_id: int, day_id: int, data: WeatherUpdate, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    _verify_trip(session, trip_id, current_user)
    _verify_day(session, day_id, trip_id)
    w = session.exec(select(DayWeather).where(DayWeather.day_id == day_id)).first()
    if not w: raise HTTPException(status_code=404, detail="No weather data")
    for k, v in data.model_dump(exclude_unset=True).items(): setattr(w, k, v)
    session.commit(); session.refresh(w)
    return w

@router.delete("/{trip_id}/days/{day_id}/weather", status_code=status.HTTP_204_NO_CONTENT)
def delete_weather(trip_id: int, day_id: int, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    _verify_trip(session, trip_id, current_user)
    _verify_day(session, day_id, trip_id)
    w = session.exec(select(DayWeather).where(DayWeather.day_id == day_id)).first()
    if not w: raise HTTPException(status_code=404, detail="No weather data")
    session.delete(w); session.commit()
