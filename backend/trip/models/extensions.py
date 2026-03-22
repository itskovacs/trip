from sqlalchemy import Column, JSON, Text
from sqlmodel import Field, Relationship, SQLModel

from .models import Place, Trip, TripDay, TripItem  # noqa: F401 – needed for FK resolution


class PlaceDetails(SQLModel, table=True):
    __tablename__ = "place_details"

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        foreign_key="place.id",
        unique=True,
        index=True,
        ondelete="CASCADE",
    )

    opening_hours: dict | None = Field(default=None, sa_column=Column(JSON))
    rating: float | None = None
    photos: list | None = Field(default=None, sa_column=Column(JSON))
    tips: str | None = None
    links: list | None = Field(default=None, sa_column=Column(JSON))
    subcategory: str | None = None
    address: str | None = None
    contact_phone: str | None = None
    contact_website: str | None = None
    contact_email: str | None = None

    place: Place | None = Relationship()


class TripItemDetails(SQLModel, table=True):
    __tablename__ = "tripitem_details"

    id: int | None = Field(default=None, primary_key=True)
    item_id: int = Field(
        foreign_key="tripitem.id",
        unique=True,
        index=True,
        ondelete="CASCADE",
    )

    confirmation_code: str | None = None
    priority: str | None = None
    duration_minutes: int | None = None
    alternative_item_id: int | None = Field(
        default=None,
        foreign_key="tripitem.id",
        ondelete="SET NULL",
    )
    alternative_reason: str | None = None

    item: TripItem | None = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[TripItemDetails.item_id]"},
    )
    alternative_item: TripItem | None = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[TripItemDetails.alternative_item_id]"},
    )


class RestaurantDetails(SQLModel, table=True):
    __tablename__ = "restaurant_details"

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        foreign_key="place.id",
        unique=True,
        index=True,
        ondelete="CASCADE",
    )

    cuisine: str | None = None
    price_range: str | None = None
    reservation_required: bool | None = False
    must_try: bool | None = False

    place: Place | None = Relationship()


class Dish(SQLModel, table=True):
    __tablename__ = "dish"

    id: int | None = Field(default=None, primary_key=True)
    place_id: int = Field(
        foreign_key="place.id",
        index=True,
        ondelete="CASCADE",
    )

    name: str
    price: float | None = None
    description: str | None = None

    place: Place | None = Relationship()


class ItemRoute(SQLModel, table=True):
    __tablename__ = "item_route"

    id: int | None = Field(default=None, primary_key=True)
    from_item_id: int = Field(
        foreign_key="tripitem.id",
        index=True,
        ondelete="CASCADE",
    )
    to_item_id: int = Field(
        foreign_key="tripitem.id",
        index=True,
        ondelete="CASCADE",
    )
    day_id: int = Field(
        foreign_key="tripday.id",
        index=True,
        ondelete="CASCADE",
    )

    recommended_mode: str | None = None
    notes: str | None = None

    from_item: TripItem | None = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ItemRoute.from_item_id]"},
    )
    to_item: TripItem | None = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[ItemRoute.to_item_id]"},
    )
    day: TripDay | None = Relationship()


class RouteOption(SQLModel, table=True):
    __tablename__ = "route_option"

    id: int | None = Field(default=None, primary_key=True)
    route_id: int = Field(
        foreign_key="item_route.id",
        index=True,
        ondelete="CASCADE",
    )

    mode: str
    duration_minutes: int | None = None
    distance_km: float | None = None
    cost: float | None = None
    line_name: str | None = None
    notes: str | None = None
    recommended: bool | None = False

    route: ItemRoute | None = Relationship()


class TripFlight(SQLModel, table=True):
    __tablename__ = "trip_flight"

    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(
        foreign_key="trip.id",
        index=True,
        ondelete="CASCADE",
    )

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

    trip: Trip | None = Relationship()


class TripAccommodation(SQLModel, table=True):
    __tablename__ = "trip_accommodation"

    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(
        foreign_key="trip.id",
        index=True,
        ondelete="CASCADE",
    )

    name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    check_in: str | None = None
    check_out: str | None = None
    confirmation_code: str | None = None
    cost_per_night: float | None = None
    currency: str | None = None
    amenities: list | None = Field(default=None, sa_column=Column(JSON))
    phone: str | None = None
    website: str | None = None
    notes: str | None = None

    trip: Trip | None = Relationship()


class TripRentalCar(SQLModel, table=True):
    __tablename__ = "trip_rental_car"

    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(
        foreign_key="trip.id",
        index=True,
        ondelete="CASCADE",
    )

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

    trip: Trip | None = Relationship()


class TripBudget(SQLModel, table=True):
    __tablename__ = "trip_budget"

    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(
        foreign_key="trip.id",
        index=True,
        ondelete="CASCADE",
    )

    category: str
    planned_amount: float
    currency: str | None = None

    trip: Trip | None = Relationship()


class ExchangeRate(SQLModel, table=True):
    __tablename__ = "exchange_rate"

    id: int | None = Field(default=None, primary_key=True)
    from_currency: str
    to_currency: str
    rate: float
    fetched_at: str | None = None


class DayWeather(SQLModel, table=True):
    __tablename__ = "day_weather"

    id: int | None = Field(default=None, primary_key=True)
    day_id: int = Field(
        foreign_key="tripday.id",
        unique=True,
        index=True,
        ondelete="CASCADE",
    )

    high_temp: float | None = None
    low_temp: float | None = None
    condition: str | None = None
    rain_chance: int | None = None

    day: TripDay | None = Relationship()


class TripTravelInfo(SQLModel, table=True):
    __tablename__ = "trip_travel_info"

    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(
        foreign_key="trip.id",
        unique=True,
        index=True,
        ondelete="CASCADE",
    )

    visa_required: bool | None = None
    visa_notes: str | None = None
    vaccinations: list | None = Field(default=None, sa_column=Column(JSON))
    insurance_required: bool | None = None
    insurance_notes: str | None = None
    embassy_name: str | None = None
    embassy_phone: str | None = None
    embassy_address: str | None = None
    local_emergency_number: str | None = None
    insurance_provider: str | None = None
    insurance_policy_number: str | None = None
    insurance_phone: str | None = None
    timezone: str | None = None
    general_notes: str | None = None

    trip: Trip | None = Relationship()


class TripVersion(SQLModel, table=True):
    __tablename__ = "trip_version"

    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(
        foreign_key="trip.id",
        index=True,
        ondelete="CASCADE",
    )

    label: str | None = None
    snapshot_json: str | None = Field(default=None, sa_column=Column(Text))
    created_at: str | None = None
    created_by: str | None = None

    trip: Trip | None = Relationship()
