"""TravelThing extension models — weather forecast support."""
from sqlmodel import Field, Relationship, SQLModel
from .models import TripDay


class DayWeather(SQLModel, table=True):
    __tablename__ = "day_weather"

    id: int | None = Field(default=None, primary_key=True)
    day_id: int = Field(foreign_key="tripday.id", unique=True, index=True, ondelete="CASCADE")
    high_temp: float | None = None
    low_temp: float | None = None
    condition: str | None = None
    rain_chance: int | None = None

    day: TripDay | None = Relationship()
