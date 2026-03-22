"""CRUD router for trip version snapshots (many-to-one with Trip)."""

import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import TripVersion
from ..models.models import Trip, TripDay, TripItem

router = APIRouter(prefix="/api/trips", tags=["versions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _verify_trip(session, trip_id: int, current_user: str) -> Trip:
    """Verify trip exists and is owned by the current user."""
    trip = session.get(Trip, trip_id)
    if not trip or trip.user != current_user:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def _build_snapshot(session, trip: Trip) -> str:
    """Serialize the current trip state (trip + days + items) as JSON."""
    days = session.exec(
        select(TripDay).where(TripDay.trip_id == trip.id)
    ).all()

    days_data = []
    for day in days:
        items = session.exec(
            select(TripItem).where(TripItem.day_id == day.id)
        ).all()
        items_data = [
            {
                "id": item.id,
                "time": item.time,
                "text": item.text,
                "comment": item.comment,
                "lat": item.lat,
                "lng": item.lng,
                "price": item.price,
                "place_id": item.place_id,
                "day_id": item.day_id,
            }
            for item in items
        ]
        days_data.append(
            {
                "id": day.id,
                "label": day.label,
                "dt": str(day.dt) if day.dt else None,
                "notes": day.notes,
                "items": items_data,
            }
        )

    snapshot = {
        "trip": {
            "id": trip.id,
            "name": trip.name,
            "archived": trip.archived,
            "currency": trip.currency,
            "notes": trip.notes,
        },
        "days": days_data,
    }
    return json.dumps(snapshot)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class VersionCreate(BaseModel):
    label: str | None = None


class VersionRead(BaseModel):
    id: int
    trip_id: int
    label: str | None = None
    snapshot_json: str | None = None
    created_at: str | None = None
    created_by: str | None = None


class VersionListRead(BaseModel):
    id: int
    trip_id: int
    label: str | None = None
    created_at: str | None = None
    created_by: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{trip_id}/versions",
    response_model=VersionRead,
    status_code=201,
)
def create_version(
    trip_id: int,
    body: VersionCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    trip = _verify_trip(session, trip_id, current_user)

    snapshot = _build_snapshot(session, trip)
    version = TripVersion(
        trip_id=trip_id,
        label=body.label,
        snapshot_json=snapshot,
        created_at=datetime.now(UTC).isoformat(),
        created_by=current_user,
    )
    session.add(version)
    session.commit()
    session.refresh(version)
    return version


@router.get(
    "/{trip_id}/versions",
    response_model=list[VersionListRead],
)
def list_versions(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)
    versions = session.exec(
        select(TripVersion).where(TripVersion.trip_id == trip_id)
    ).all()
    return versions


@router.get(
    "/{trip_id}/versions/{version_id}",
    response_model=VersionRead,
)
def get_version(
    trip_id: int,
    version_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)
    version = session.get(TripVersion, version_id)
    if not version or version.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.delete(
    "/{trip_id}/versions/{version_id}",
    status_code=204,
)
def delete_version(
    trip_id: int,
    version_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)
    version = session.get(TripVersion, version_id)
    if not version or version.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Version not found")
    session.delete(version)
    session.commit()
