from sqlalchemy import Column, JSON
from sqlmodel import Field, Relationship, SQLModel

from .models import Place, TripItem  # noqa: F401 – needed for FK resolution


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
