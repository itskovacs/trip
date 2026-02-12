import re
from datetime import UTC, date, datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, StringConstraints, field_validator
from sqlalchemy import Index, MetaData, event
from sqlalchemy.orm import Session, object_session
from sqlmodel import Field, Relationship, SQLModel

from ..config import settings
from ..utils.utils import remove_attachment, remove_backup, remove_image

convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

SQLModel.metadata = MetaData(naming_convention=convention)


@event.listens_for(Session, "after_commit")
def cleanup_after_commit(session):
    if hasattr(session, "_images_to_delete"):
        for filename in session._images_to_delete:
            remove_image(filename)
        delattr(session, "_images_to_delete")

    if hasattr(session, "_attachments_to_delete"):
        for attachment in session._attachments_to_delete:
            remove_attachment(attachment.trip_id, attachment.stored_filename)
        delattr(session, "_attachments_to_delete")

    if hasattr(session, "_backups_to_delete"):
        for filename in session._backups_to_delete:
            remove_backup(filename)
        delattr(session, "_backups_to_delete")


def _prefix_assets_url(filename: str) -> str:
    base = settings.ASSETS_URL
    if not base.endswith("/"):
        base += "/"
    return base + filename


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


class BackupStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class MapProvider(str, Enum):
    OPENSTREETMAP = "osm"
    GOOGLE = "google"


class AuthParams(BaseModel):
    oidc: str | None
    register_enabled: bool


class TripShareURL(BaseModel):
    url: str


class LoginRegisterModel(BaseModel):
    username: Annotated[
        str,
        StringConstraints(min_length=1, max_length=19, pattern=r"^[a-zA-Z0-9_-]+$"),
    ]
    password: str


class UpdateUserPassword(BaseModel):
    current: str
    updated: str
    code: str | None = None


class LatitudeLongitude(BaseModel):
    latitude: float
    longitude: float


class LatLng(BaseModel):
    lat: float
    lng: float


class Token(BaseModel):
    access_token: str
    refresh_token: str


class PendingTOTP(BaseModel):
    pending_code: str
    username: str


class TokenGoogleSearch(BaseModel):
    q: str
    category: str | None = None


class ProviderPlaceResult(BaseModel):
    name: str | None = None
    place: str | None = None
    category: str | None = None
    lat: float | None = None
    lng: float | None = None
    price: float | None = None
    allowdog: bool | None = None
    description: str | None = None
    types: list[str] = []
    image: str | None = None
    restroom: bool | None


class ProviderBoundaries(BaseModel):
    northeast: LatLng
    southwest: LatLng


class OSMRoutingQuery(BaseModel):
    coordinates: list[LatLng]
    profile: str


class OSMRoutingResponse(BaseModel):
    distance: float | None
    duration: float | None
    geometry: dict | None


class ImageBase(SQLModel):
    filename: str


class Image(ImageBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user: str = Field(foreign_key="user.username", ondelete="CASCADE", index=True)

    categories: list["Category"] = Relationship(back_populates="image")
    places: list["Place"] = Relationship(back_populates="image")
    trips: list["Trip"] = Relationship(back_populates="image")
    tripitems: list["TripItem"] = Relationship(back_populates="image")


@event.listens_for(Image, "after_delete")
def mark_image_for_deletion(mapper, connection, target: Image):
    session = object_session(target)
    if not session:
        return
    if not hasattr(session, "_images_to_delete"):
        session._images_to_delete = []
    session._images_to_delete.append(target.filename)


class BackupBase(SQLModel):
    completed_at: datetime | None = None
    filename: str | None = None
    error_message: str | None = None
    file_size: int | None = None


class Backup(BackupBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user: str = Field(foreign_key="user.username", ondelete="CASCADE")
    status: BackupStatus = Field(default=BackupStatus.PENDING)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


@event.listens_for(Backup, "after_delete")
def mark_backup_for_deletion(mapper, connection, target: Backup):
    session = object_session(target)
    if not session:
        return
    if not hasattr(session, "_backups_to_delete"):
        session._backups_to_delete = []
    session._backups_to_delete.append(target.filename)


class BackupRead(BackupBase):
    id: int
    created_at: datetime
    status: str
    user: str

    @classmethod
    def serialize(cls, obj: Backup) -> "BackupRead":
        return cls(
            id=obj.id,
            completed_at=obj.completed_at,
            created_at=obj.created_at,
            error_message=obj.error_message,
            filename=obj.filename,
            file_size=obj.file_size,
            status=obj.status,
            user=obj.user,
        )


class UserBase(SQLModel):
    map_lat: float = settings.DEFAULT_MAP_LAT
    map_lng: float = settings.DEFAULT_MAP_LNG
    currency: str = settings.DEFAULT_CURRENCY
    do_not_display: str = ""
    tile_layer: str | None = None
    mode_low_network: bool | None = True
    mode_dark: bool | None = False
    mode_gpx_in_place: bool | None = False
    mode_display_visited: bool | None = False
    mode_map_position: bool | None = False
    api_token: str | None = None
    duplicate_dist: int | None = None


class User(UserBase, table=True):
    username: str = Field(primary_key=True)
    password: str
    totp_enabled: bool = False
    totp_secret: str | None = None
    google_apikey: str | None = None
    map_provider: MapProvider = Field(default=MapProvider.OPENSTREETMAP)


class UserUpdate(UserBase):
    map_lat: float | None = None
    map_lng: float | None = None
    currency: str | None = None
    do_not_display: list[str] | None = None
    google_apikey: str | None = None
    map_provider: MapProvider | None = None


class UserRead(UserBase):
    username: str
    do_not_display: list[str]
    totp_enabled: bool
    google_apikey: bool
    api_token: bool
    map_provider: str

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
            mode_display_visited=obj.mode_display_visited,
            mode_map_position=obj.mode_map_position,
            totp_enabled=obj.totp_enabled,
            google_apikey=True if obj.google_apikey else False,
            api_token=True if obj.api_token else False,
            map_provider=obj.map_provider.value,
            duplicate_dist=obj.duplicate_dist,
        )


class CategoryBase(SQLModel):
    name: str
    color: str | None = None


class Category(CategoryBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    image_id: int | None = Field(default=None, foreign_key="image.id", ondelete="CASCADE")
    image: Image | None = Relationship(back_populates="categories")
    places: list["Place"] = Relationship(back_populates="category")
    user: str = Field(foreign_key="user.username", ondelete="CASCADE", index=True)


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
    place_id: int = Field(foreign_key="place.id", primary_key=True, index=True)


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
    restroom: bool | None = None


class Place(PlaceBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    cdate: date = Field(default_factory=lambda: datetime.now(UTC))
    user: str = Field(foreign_key="user.username", ondelete="CASCADE", index=True)

    image_id: int | None = Field(default=None, foreign_key="image.id", ondelete="CASCADE")
    image: Image | None = Relationship(back_populates="places")

    category_id: int = Field(foreign_key="category.id", index=True)
    category: Category | None = Relationship(back_populates="places")

    trip_items: list["TripItem"] = Relationship(back_populates="place")

    trips: list["Trip"] = Relationship(back_populates="places", link_model=TripPlaceLink)

    __table_args__ = (Index("idx_place_user_category", "user", "category_id"),)


class PlaceCreate(PlaceBase):
    image: str | None = None
    category_id: int


class TokenPlaceCreate(PlaceBase):
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
    user: str

    @classmethod
    def serialize(cls, obj: Place, exclude_gpx=True) -> "PlaceRead":
        return cls(
            id=obj.id,
            user=obj.user,
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
            restroom=obj.restroom,
        )


class TripBase(SQLModel):
    name: str
    archived: bool | None = None
    currency: str | None = settings.DEFAULT_CURRENCY
    notes: str | None = None
    archival_review: str | None = None


class Trip(TripBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user: str = Field(foreign_key="user.username", ondelete="CASCADE", index=True)
    image_id: int | None = Field(default=None, foreign_key="image.id", ondelete="CASCADE")

    image: Image | None = Relationship(back_populates="trips")
    places: list["Place"] = Relationship(
        back_populates="trips", sa_relationship_kwargs={"order_by": "Place.name"}, link_model=TripPlaceLink
    )
    days: list["TripDay"] = Relationship(
        back_populates="trip",
        sa_relationship_kwargs={"order_by": lambda: [TripDay.dt.asc().nulls_last(), TripDay.label]},
        cascade_delete=True,
    )
    shares: list["TripShare"] = Relationship(back_populates="trip", cascade_delete=True)
    packing_items: list["TripPackingListItem"] = Relationship(back_populates="trip", cascade_delete=True)
    checklist_items: list["TripChecklistItem"] = Relationship(back_populates="trip", cascade_delete=True)
    memberships: list["TripMember"] = Relationship(back_populates="trip", cascade_delete=True)
    attachments: list["TripAttachment"] = Relationship(back_populates="trip", cascade_delete=True)


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
            currency=obj.currency if obj.currency else settings.DEFAULT_CURRENCY,
        )


class TripRead(TripBase):
    id: int
    image: str | None
    image_id: int | None
    days: list["TripDayRead"]
    places: list["PlaceRead"]
    collaborators: list["TripMemberRead"]
    shared: bool
    attachments: list["TripAttachmentRead"]

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
            shared=bool(obj.shares),
            currency=obj.currency if obj.currency else settings.DEFAULT_CURRENCY,
            notes=obj.notes,
            archival_review=obj.archival_review,
            attachments=[TripAttachmentRead.serialize(att) for att in obj.attachments],
        )


class TripMember(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user: str = Field(foreign_key="user.username", ondelete="CASCADE")
    invited_by: str | None = Field(default=None, foreign_key="user.username", ondelete="SET NULL")
    invited_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    joined_at: datetime | None = None

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE", index=True)
    trip: Trip | None = Relationship(back_populates="memberships")

    __table_args__ = (Index("idx_tripmember_trip_user_joined", "trip_id", "user", "joined_at"),)


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
    dt: date | None = None
    notes: str | None = None


class TripDay(TripDayBase, table=True):
    id: int | None = Field(default=None, primary_key=True)

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE", index=True)
    trip: Trip | None = Relationship(back_populates="days")

    items: list["TripItem"] = Relationship(back_populates="day", cascade_delete=True)


class TripDayRead(TripDayBase):
    id: int
    items: list["TripItemRead"]

    @classmethod
    def serialize(cls, obj: TripDay) -> "TripDayRead":
        return cls(
            id=obj.id,
            dt=obj.dt,
            label=obj.label,
            items=[TripItemRead.serialize(item) for item in obj.items],
            notes=obj.notes,
        )


class TripItemAttachmentLink(SQLModel, table=True):
    item_id: int = Field(foreign_key="tripitem.id", ondelete="CASCADE", primary_key=True, index=True)
    attachment_id: int = Field(foreign_key="tripattachment.id", ondelete="CASCADE", primary_key=True)


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
    gpx: str | None = None

    @field_validator("time", mode="before")
    def pad_mm_if_needed(cls, value: str) -> str:
        if re.fullmatch(r"^([01]\d|2[0-3])$", value):  # If it's just HH
            return f"{value}:00"
        return value


class TripItem(TripItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)

    place_id: int | None = Field(default=None, foreign_key="place.id")
    place: Place | None = Relationship(back_populates="trip_items")

    image_id: int | None = Field(default=None, foreign_key="image.id", ondelete="CASCADE")
    image: Image | None = Relationship(back_populates="tripitems")

    day_id: int = Field(foreign_key="tripday.id", ondelete="CASCADE", index=True)
    day: TripDay | None = Relationship(back_populates="items")

    paid_by: int | None = Field(default=None, foreign_key="user.username", ondelete="SET NULL")

    attachments: list["TripAttachment"] = Relationship(
        back_populates="items", link_model=TripItemAttachmentLink
    )


class TripItemCreate(TripItemBase):
    place: int | None = None
    status: TripItemStatusEnum | None = None
    image: str | None = None
    paid_by: str | None = None
    attachment_ids: list[int] = []


class TripItemUpdate(TripItemBase):
    time: str | None = None
    text: str | None = None
    place: int | None = None
    day_id: int | None = None
    status: TripItemStatusEnum | None = None
    image: str | None = None
    paid_by: str | None = None
    attachment_ids: list[int] = []


class TripItemRead(TripItemBase):
    id: int
    place: PlaceRead | None
    day_id: int
    status: TripItemStatusEnum | None
    image: str | None
    image_id: int | None
    paid_by: str | None
    attachments: list["TripAttachmentRead"]

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
            image=_prefix_assets_url(obj.image.filename) if obj.image else None,
            image_id=obj.image_id,
            gpx=obj.gpx,
            paid_by=obj.paid_by,
            attachments=[TripAttachmentRead.serialize(att) for att in obj.attachments],
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

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE", index=True)
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

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE", index=True)
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


class TripAttachmentBase(SQLModel):
    filename: str
    file_size: int
    stored_filename: str


class TripAttachment(TripAttachmentBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    uploaded_by: str = Field(foreign_key="user.username", ondelete="CASCADE")

    trip_id: int = Field(foreign_key="trip.id", ondelete="CASCADE", index=True)
    trip: Trip | None = Relationship(back_populates="attachments")

    items: list["TripItem"] = Relationship(back_populates="attachments", link_model=TripItemAttachmentLink)


@event.listens_for(TripAttachment, "after_delete")
def mark_attachment_for_deletion(mapper, connection, target: TripAttachment):
    session = object_session(target)
    if not session:
        return
    if not hasattr(session, "_attachments_to_delete"):
        session._attachments_to_delete = []
    session._attachments_to_delete.append(target)


class TripAttachmentCreate(TripAttachmentBase): ...


class TripAttachmentRead(TripAttachmentBase):
    id: int
    uploaded_by: str

    @classmethod
    def serialize(cls, obj: TripAttachment) -> "TripAttachmentRead":
        return cls(
            id=obj.id,
            filename=obj.filename,
            file_size=obj.file_size,
            uploaded_by=obj.uploaded_by,
            stored_filename=obj.stored_filename,
        )
