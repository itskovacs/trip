"""CRUD router for trip reservations (flights, accommodation, rental cars)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import TripAccommodation, TripFlight, TripRentalCar
from ._helpers import verify_trip_ownership

router = APIRouter(prefix="/api/trips", tags=["reservations"])


# ---------------------------------------------------------------------------
# Pydantic schemas – Flights
# ---------------------------------------------------------------------------


class FlightCreate(BaseModel):
    airline: str | None = None
    flight_number: str | None = None
    departure_airport: str | None = None
    departure_datetime: str | None = None
    arrival_airport: str | None = None
    arrival_datetime: str | None = None
    confirmation_code: str | None = None
    cost: float | None = None
    currency: str | None = None
    seat_info: str | None = None
    notes: str | None = None


class FlightUpdate(BaseModel):
    airline: str | None = None
    flight_number: str | None = None
    departure_airport: str | None = None
    departure_datetime: str | None = None
    arrival_airport: str | None = None
    arrival_datetime: str | None = None
    confirmation_code: str | None = None
    cost: float | None = None
    currency: str | None = None
    seat_info: str | None = None
    notes: str | None = None


class FlightRead(BaseModel):
    id: int
    trip_id: int
    airline: str | None = None
    flight_number: str | None = None
    departure_airport: str | None = None
    departure_datetime: str | None = None
    arrival_airport: str | None = None
    arrival_datetime: str | None = None
    confirmation_code: str | None = None
    cost: float | None = None
    currency: str | None = None
    seat_info: str | None = None
    notes: str | None = None


# ---------------------------------------------------------------------------
# Pydantic schemas – Accommodation
# ---------------------------------------------------------------------------


class AccommodationCreate(BaseModel):
    name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    check_in: str | None = None
    check_out: str | None = None
    confirmation_code: str | None = None
    cost_per_night: float | None = None
    currency: str | None = None
    amenities: list | None = None
    phone: str | None = None
    website: str | None = None
    notes: str | None = None


class AccommodationRead(BaseModel):
    id: int
    trip_id: int
    name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    check_in: str | None = None
    check_out: str | None = None
    confirmation_code: str | None = None
    cost_per_night: float | None = None
    currency: str | None = None
    amenities: list | None = None
    phone: str | None = None
    website: str | None = None
    notes: str | None = None


# ---------------------------------------------------------------------------
# Pydantic schemas – Rental Cars
# ---------------------------------------------------------------------------


class RentalCarCreate(BaseModel):
    company: str | None = None
    pickup_location: str | None = None
    pickup_datetime: str | None = None
    dropoff_location: str | None = None
    dropoff_datetime: str | None = None
    confirmation_code: str | None = None
    cost_per_day: float | None = None
    currency: str | None = None
    vehicle_type: str | None = None
    notes: str | None = None


class RentalCarRead(BaseModel):
    id: int
    trip_id: int
    company: str | None = None
    pickup_location: str | None = None
    pickup_datetime: str | None = None
    dropoff_location: str | None = None
    dropoff_datetime: str | None = None
    confirmation_code: str | None = None
    cost_per_day: float | None = None
    currency: str | None = None
    vehicle_type: str | None = None
    notes: str | None = None


# ---------------------------------------------------------------------------
# Flights endpoints
# ---------------------------------------------------------------------------


@router.post("/{trip_id}/flights", response_model=FlightRead, status_code=201)
def create_flight(
    trip_id: int,
    body: FlightCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    flight = TripFlight(trip_id=trip_id, **body.model_dump())
    session.add(flight)
    session.commit()
    session.refresh(flight)
    return flight


@router.get("/{trip_id}/flights", response_model=list[FlightRead])
def list_flights(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    flights = session.exec(
        select(TripFlight).where(TripFlight.trip_id == trip_id)
    ).all()
    return flights


@router.get("/{trip_id}/flights/{flight_id}", response_model=FlightRead)
def get_flight(
    trip_id: int,
    flight_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    flight = session.get(TripFlight, flight_id)
    if not flight or flight.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Flight not found")
    return flight


@router.put("/{trip_id}/flights/{flight_id}", response_model=FlightRead)
def update_flight(
    trip_id: int,
    flight_id: int,
    body: FlightUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    flight = session.get(TripFlight, flight_id)
    if not flight or flight.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Flight not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(flight, key, value)

    session.add(flight)
    session.commit()
    session.refresh(flight)
    return flight


@router.delete("/{trip_id}/flights/{flight_id}", status_code=204)
def delete_flight(
    trip_id: int,
    flight_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    flight = session.get(TripFlight, flight_id)
    if not flight or flight.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Flight not found")
    session.delete(flight)
    session.commit()


# ---------------------------------------------------------------------------
# Accommodation endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{trip_id}/accommodation", response_model=AccommodationRead, status_code=201
)
def create_accommodation(
    trip_id: int,
    body: AccommodationCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    accommodation = TripAccommodation(trip_id=trip_id, **body.model_dump())
    session.add(accommodation)
    session.commit()
    session.refresh(accommodation)
    return accommodation


@router.get("/{trip_id}/accommodation", response_model=list[AccommodationRead])
def list_accommodation(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    items = session.exec(
        select(TripAccommodation).where(TripAccommodation.trip_id == trip_id)
    ).all()
    return items


@router.delete("/{trip_id}/accommodation/{accommodation_id}", status_code=204)
def delete_accommodation(
    trip_id: int,
    accommodation_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    accommodation = session.get(TripAccommodation, accommodation_id)
    if not accommodation or accommodation.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Accommodation not found")
    session.delete(accommodation)
    session.commit()


# ---------------------------------------------------------------------------
# Rental Cars endpoints
# ---------------------------------------------------------------------------


@router.post("/{trip_id}/rental-cars", response_model=RentalCarRead, status_code=201)
def create_rental_car(
    trip_id: int,
    body: RentalCarCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    car = TripRentalCar(trip_id=trip_id, **body.model_dump())
    session.add(car)
    session.commit()
    session.refresh(car)
    return car


@router.get("/{trip_id}/rental-cars", response_model=list[RentalCarRead])
def list_rental_cars(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    cars = session.exec(
        select(TripRentalCar).where(TripRentalCar.trip_id == trip_id)
    ).all()
    return cars


@router.delete("/{trip_id}/rental-cars/{car_id}", status_code=204)
def delete_rental_car(
    trip_id: int,
    car_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    car = session.get(TripRentalCar, car_id)
    if not car or car.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Rental car not found")
    session.delete(car)
    session.commit()
