import re
from datetime import UTC, date, datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, StringConstraints, field_validator
from sqlalchemy import MetaData
from sqlmodel import Field, Relationship, SQLModel

from ..config import settings

convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

SQLModel.metadata = MetaData(naming_convention=convention)


def _prefix_assets_url(filename: str) -> str:
    base = settings.ASSETS_URL
    if not base.endswith("/"):
        base += "/"
    return base + filename


class AuthParams(BaseModel):
    oidc: str | None
    register_enabled: bool


class TripItemStatusEnum(str, Enum):
    PENDING = "pending"
    CONFIRMED = "booked"
    CONSTRAINT = "constraint"
    OPTIONAL = "optional"


class PackingListCategoryEnum(str, Enum):
    CLOTHES = "clothes"
    TOILETRIES = "toiletries"
    TECH = "tech"
    DOCUMENTS = "documents"
    OTHER = "other"


class TripShareURL(BaseModel):
    url: str


class LoginRegisterModel(BaseModel):
    username: Annotated[
        str,
        StringConstraints(min_length=1, max_length=19, pattern=r"^[a-zA-Z0-9_-]+$"),
    ]
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str


class ImageBase(SQLModel):
    filename: str


class Image(ImageBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user: str = Field(foreign_key="user.username", ondelete="CASCADE")

    categories: list["Category"] = Relationship(back_populates="image")
    places: list["Place"] = Relationship(back_populates="image")
    trips: list["Trip"] = Relationship(back_populates="image")


class UserBase(SQLModel):
    map_lat: float = settings.DEFAULT_MAP_LAT
    map_lng: float = settings.DEFAULT_MAP_LNG
    currency: str = settings.DEFAULT_CURRENCY
    do_not_display: str = ""
    tile_layer: str | None = None
    mode_low_network: bool | None = True
    mode_dark: bool | None = False
    mode_gpx_in_place: bool | None = False


class User(UserBase, table=True):
    username: str = Field(primary_key=True)
    password: str


class UserUpdate(UserBase):
    map_lat: float | None = None
    map_lng: float | None = None
    currency: str | None = None
    do_not_display: list[str] | None = None


class UserRead(UserBase):
    username: str
    do_not_display: list[str]

    @classmethod
    def serialize(cls, obj: User) -> "UserRead":
        return cls(
            username=obj.username,
            map_lat=obj.map_lat,
            map_lng=obj.map_lng,
            currency=obj.currency,
            do_not_display=obj.do_not_display.split(",") if obj.do_not_display else [],
            tile_layer=obj.tile_layer if obj.tile_layer else settings.DEFAULT_TILE,
            mode_low_network=obj.mode_low_network,
            mode_dark=obj.mode_dark,
            mode_gpx_in_place=obj.mode_gpx_in_place,
        )


class CategoryBase(SQLModel):
    name: str
    color: str | None = None


class Category(CategoryBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    image_id: int | None = Field(default=None, foreign_key="image.id", ondelete="CASCADE")
    image: Image | None = Relationship(back_populates="categories")
    places: list["Place"] = Relationship(back_populates="category")
    user: str = Field(foreign_key="user.username", ondelete="CASCADE")


class CategoryCreate(CategoryBase):
    name: str
    image: str | None = None
    color: str | None = None


class CategoryUpdate(CategoryBase):
    name: str | None = None
    image: str | None = None
    color: str | None = None


class CategoryRead(CategoryBase):
    id: int
    image: str | None
    image_id: int | None
    color: str

    @classmethod
    def serialize(cls, obj: Category) -> "CategoryRead":
        return cls(
            id=obj.id,
            name=obj.name,
            image_id=obj.image_id,
            image=_prefix_assets_url(obj.image.filename) if obj.image else "/favicon.png",
            color=obj.color if obj.color else "#000000",
        )


class TripPlaceLink(SQLModel, table=True):
    trip_id: int = Field(foreign_key="trip.id", primary_key=True)
    place_id: int = Field(foreign_key="place.id", primary_key=True)


class PlaceBase(SQLModel):
    name: str
    lat: float
    lng: float
    place: str
    allowdog: bool | None = None
    description: str | None = None
    price: float | None = None
    duration: int | None = None
    favorite: bool | None = None
    visited: bool | None = None
    gpx: str | None = None


class Place(PlaceBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    cdate: date = Field(default_factory=lambda: datetime.now(UTC))
    user: str = Field(foreign_key="user.username", ondelete="CASCADE")

    image_id: int | None = Field(default=None, foreign_key="image.id", ondelete="CASCADE")
    image: Image | None = Relationship(back_populates="places")

    category_id: int = Field(foreign_key="category.id")
    category: Category | None = Relationship(back_populates="places")

    trip_items: list["TripItem"] = Relationship(back_populates="place")

    trips: list["Trip"] = Relationship(back_populates="places", link_model=TripPlaceLink)


class PlaceCreate(PlaceBase):
    image: str | None = None
    category_id: int
    gpx: str | None = None


class PlacesCreate(PlaceBase):
    image: str | None = None
    category: str


class PlaceUpdate(PlaceBase):
    name: str | None = None
    lat: float | None = None
    lng: float | None = None
    place: str | None = None
    category_id: int | None = None
    image: str | None = None


class PlaceRead(PlaceBase):
    id: int
    category: CategoryRead
    image: str | None
    image_id: int | None

    @classmethod
    def serialize(cls, obj: Place, exclude_gpx=True) -> "PlaceRead":
        return cls(
            id=obj.id,
            name=obj.name,
            lat=obj.lat,
            lng=obj.lng,
            place=obj.place,
            category=CategoryRead.serialize(obj.category),
            allowdog=obj.allowdog,
            description=obj.description,
            price=obj.price,
            duration=obj.duration,
            visited=obj.visited,
            image=_prefix_assets_url(obj.image.filename) if obj.image else None,
            image_id=obj.image_id,
            favorite=obj.favorite,
            gpx=("1" if obj.gpx else None)
            if exclude_gpx
            else obj.gpx,  # Generic PlaceRead. Avoid large resp.
        )


class TripBase(SQLModel):
    name: str
    archived: bool | None = None


class Trip(TripBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    image_id: int | None = Field(default=None, foreign_key="image.id", ondelete="CASCADE")
    image: Image | None = Relationship(back_populates="trips")
    user: str = Field(foreign_key="user.username", ondelete="CASCADE")

    places: list["Place"] = Relationship(back_populates="trips", link_model=TripPlaceLink)
    days: list["TripDay"] = Relationship(back_populates="trip", cascade_delete=True)
    shares: list["TripShare"] = Relationship(back_populates="trip", cascade_delete=True)
    packing_items: list["TripPackingListItem"] = Relationship(back_populates="trip", cascade_delete=True)
    checklist_items: list["TripChecklistItem"] = Relationship(back_populates="trip", cascade_delete=True)
    memberships: list["TripMember"] = Relationship(back_populates="trip", cascade_delete=True)


class TripCreate(TripBase):
    image: str | None = None
    place_ids: list[int] = []


class TripUpdate(TripBase):
    name: str | None = None
    image: str | None = None
    place_ids: list[int] = []


class TripReadBase(TripBase):
    id: int
    image: str | None
    image_id: int | None
    days: int
    collaborators: list["TripMemberRead"]

    @classmethod
    def serialize(cls, obj: Trip) -> "TripRead":
        return cls(
            id=obj.id,
            name=obj.name,
            archived=obj.archived,
            image=_prefix_assets_url(obj.image.filename) if obj.image else None,
            image_id=obj.image_id,
            days=len(obj.days),
            collaborators=[TripMemberRead.serialize(m) for m in obj.memberships],
        )


class TripRead(TripBase):
    id: int
    image: str | None
    image_id: int | None
    days: list["TripDayRead"]
    places: list["PlaceRead"]
    collaborators: list["TripMemberRead"]

    @classmethod
    def serialize(cls, obj: Trip) -> "TripRead":
        return cls(
            id=obj.id,
            name=obj.name,
            archived=obj.archived,
            image=_prefix_assets_url(obj.image.filename) if obj.image else None,
            image_id=obj.image_id,
            days=[TripDayRead.serialize(day) for day in obj.days],
            places=[PlaceRead.serialize(place) for place in obj.places],
            collaborators=[TripMemberRead.serialize(m) for m in obj.memberships],
        )


class TripMember(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user: str = Field(foreign_key="user.username", ondelete="CASCADE")
    invited_by: str | None = Field(default=None, foreign_key="user.username", ondelete="SET NULL")
    invited_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    joined_at: datetime | None = None

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE")
    trip: Trip | None = Relationship(back_populates="memberships")


class TripMemberCreate(BaseModel):
    user: str


class TripMemberRead(BaseModel):
    user: str
    invited_by: str | None = None
    invited_at: datetime | None = None
    joined_at: datetime | None = None

    @classmethod
    def serialize(cls, obj: TripMember) -> "TripMemberRead":
        return cls(
            user=obj.user, invited_by=obj.invited_by, invited_at=obj.invited_at, joined_at=obj.joined_at
        )


class TripInvitationRead(TripReadBase):
    invited_by: str | None = None
    invited_at: datetime


class TripDayBase(SQLModel):
    label: str


class TripDay(TripDayBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE")
    trip: Trip | None = Relationship(back_populates="days")

    items: list["TripItem"] = Relationship(back_populates="day", cascade_delete=True)


class TripDayRead(TripDayBase):
    id: int
    items: list["TripItemRead"]

    @classmethod
    def serialize(cls, obj: TripDay) -> "TripDayRead":
        return cls(
            id=obj.id,
            label=obj.label,
            items=[TripItemRead.serialize(item) for item in obj.items],
        )


class TripItemBase(SQLModel):
    time: Annotated[
        str,
        StringConstraints(min_length=2, max_length=5, pattern=r"^([01]\d|2[0-3])(:[0-5]\d)?$"),
    ]
    text: str
    comment: str | None = None
    lat: float | None = None
    price: float | None = None
    lng: float | None = None
    status: TripItemStatusEnum | None = None

    @field_validator("time", mode="before")
    def pad_mm_if_needed(cls, value: str) -> str:
        if re.fullmatch(r"^([01]\d|2[0-3])$", value):  # If it's just HH
            return f"{value}:00"
        return value


class TripItem(TripItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)

    place_id: int | None = Field(default=None, foreign_key="place.id")
    place: Place | None = Relationship(back_populates="trip_items")

    day_id: int = Field(foreign_key="tripday.id", ondelete="CASCADE")
    day: TripDay | None = Relationship(back_populates="items")


class TripItemCreate(TripItemBase):
    place: int | None = None
    status: TripItemStatusEnum | None = None


class TripItemUpdate(TripItemBase):
    time: str | None = None
    text: str | None = None
    place: int | None = None
    day_id: int | None = None
    status: TripItemStatusEnum | None = None


class TripItemRead(TripItemBase):
    id: int
    place: PlaceRead | None
    day_id: int
    status: TripItemStatusEnum | None

    @classmethod
    def serialize(cls, obj: TripItem) -> "TripItemRead":
        return cls(
            id=obj.id,
            time=obj.time,
            text=obj.text,
            comment=obj.comment,
            lat=obj.lat,
            lng=obj.lng,
            price=obj.price,
            day_id=obj.day_id,
            status=obj.status,
            place=PlaceRead.serialize(obj.place) if obj.place else None,
        )


class TripShare(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    token: str = Field(index=True, unique=True)

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE")
    trip: Trip | None = Relationship(back_populates="shares")


class TripPackingListItemBase(SQLModel):
    text: str | None = None
    qt: int | None = None
    category: PackingListCategoryEnum | None = None
    packed: bool | None = None


class TripPackingListItem(TripPackingListItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE")
    trip: Trip | None = Relationship(back_populates="packing_items")


class TripPackingListItemCreate(TripPackingListItemBase):
    packed: bool = False


class TripPackingListItemUpdate(TripPackingListItemBase): ...


class TripPackingListItemRead(TripPackingListItemBase):
    id: int

    @classmethod
    def serialize(cls, obj: "TripPackingListItem") -> "TripPackingListItemRead":
        return cls(
            id=obj.id,
            text=obj.text,
            qt=obj.qt,
            category=obj.category,
            packed=obj.packed,
        )


class TripChecklistItemBase(SQLModel):
    text: str | None = None
    checked: bool | None = None


class TripChecklistItem(TripChecklistItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE")
    trip: Trip | None = Relationship(back_populates="checklist_items")


class TripChecklistItemCreate(TripChecklistItemBase):
    checked: bool = False


class TripChecklistItemUpdate(TripChecklistItemBase): ...


class TripChecklistItemRead(TripChecklistItemBase):
    id: int

    @classmethod
    def serialize(cls, obj: "TripChecklistItem") -> "TripChecklistItemRead":
        return cls(
            id=obj.id,
            text=obj.text,
            checked=obj.checked,
        )
