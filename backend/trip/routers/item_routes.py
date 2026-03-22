"""CRUD router for transport routes (ItemRoute) and route options (RouteOption)."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import ItemRoute, RouteOption
from ..models.models import TripDay, TripItem
from ._helpers import verify_trip_ownership, verify_item_in_trip, verify_day_in_trip

router = APIRouter(prefix="/api/trips", tags=["routes"])


def _get_route_for_trip(session, route_id: int, trip_id: int) -> ItemRoute:
    """Get a route and verify it belongs to the trip (via its day)."""
    route = session.get(ItemRoute, route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    day = session.get(TripDay, route.day_id)
    if not day or day.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Route not found")
    return route


# ---------------------------------------------------------------------------
# Pydantic schemas – ItemRoute
# ---------------------------------------------------------------------------


class RouteCreate(BaseModel):
    from_item_id: int
    to_item_id: int
    day_id: int
    recommended_mode: str | None = None
    notes: str | None = None


class RouteRead(BaseModel):
    id: int
    from_item_id: int
    to_item_id: int
    day_id: int
    recommended_mode: str | None = None
    notes: str | None = None


class RouteReadWithOptions(RouteRead):
    options: list["RouteOptionRead"] = []


# ---------------------------------------------------------------------------
# Pydantic schemas – RouteOption
# ---------------------------------------------------------------------------


ROUTE_MODES = Literal["walk", "tram", "bus", "taxi", "metro", "car", "ferry", "bike"]


class RouteOptionCreate(BaseModel):
    mode: ROUTE_MODES
    duration_minutes: int | None = None
    distance_km: float | None = None
    cost: float | None = None
    line_name: str | None = None
    notes: str | None = None
    recommended: bool | None = False


class RouteOptionRead(BaseModel):
    id: int
    route_id: int
    mode: str
    duration_minutes: int | None = None
    distance_km: float | None = None
    cost: float | None = None
    line_name: str | None = None
    notes: str | None = None
    recommended: bool | None = False


# ---------------------------------------------------------------------------
# ItemRoute endpoints
# ---------------------------------------------------------------------------


@router.post("/{trip_id}/routes", response_model=RouteRead, status_code=201)
def create_route(
    trip_id: int,
    body: RouteCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    verify_item_in_trip(session, body.from_item_id, trip_id)
    verify_item_in_trip(session, body.to_item_id, trip_id)
    verify_day_in_trip(session, body.day_id, trip_id)

    route = ItemRoute(**body.model_dump())
    session.add(route)
    session.commit()
    session.refresh(route)
    return route


@router.get("/{trip_id}/routes", response_model=list[RouteRead])
def list_routes(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    # Get all day IDs for this trip, then find routes on those days
    day_ids = session.exec(
        select(TripDay.id).where(TripDay.trip_id == trip_id)
    ).all()
    if not day_ids:
        return []
    routes = session.exec(
        select(ItemRoute).where(ItemRoute.day_id.in_(day_ids))
    ).all()
    return routes


@router.get("/{trip_id}/routes/{route_id}", response_model=RouteReadWithOptions)
def get_route(
    trip_id: int,
    route_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    route = _get_route_for_trip(session, route_id, trip_id)
    options = session.exec(
        select(RouteOption).where(RouteOption.route_id == route.id)
    ).all()
    return RouteReadWithOptions(
        id=route.id,
        from_item_id=route.from_item_id,
        to_item_id=route.to_item_id,
        day_id=route.day_id,
        recommended_mode=route.recommended_mode,
        notes=route.notes,
        options=[RouteOptionRead.model_validate(o, from_attributes=True) for o in options],
    )


@router.delete("/{trip_id}/routes/{route_id}", status_code=204)
def delete_route(
    trip_id: int,
    route_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    route = _get_route_for_trip(session, route_id, trip_id)
    session.delete(route)
    session.commit()


# ---------------------------------------------------------------------------
# RouteOption endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{trip_id}/routes/{route_id}/options",
    response_model=RouteOptionRead,
    status_code=201,
)
def create_route_option(
    trip_id: int,
    route_id: int,
    body: RouteOptionCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    _get_route_for_trip(session, route_id, trip_id)

    option = RouteOption(route_id=route_id, **body.model_dump())
    session.add(option)
    session.commit()
    session.refresh(option)
    return option


@router.get(
    "/{trip_id}/routes/{route_id}/options",
    response_model=list[RouteOptionRead],
)
def list_route_options(
    trip_id: int,
    route_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    _get_route_for_trip(session, route_id, trip_id)

    options = session.exec(
        select(RouteOption).where(RouteOption.route_id == route_id)
    ).all()
    return options


@router.delete(
    "/{trip_id}/routes/{route_id}/options/{option_id}",
    status_code=204,
)
def delete_route_option(
    trip_id: int,
    route_id: int,
    option_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    verify_trip_ownership(session, trip_id, current_user)
    _get_route_for_trip(session, route_id, trip_id)

    option = session.get(RouteOption, option_id)
    if not option or option.route_id != route_id:
        raise HTTPException(status_code=404, detail="Route option not found")
    session.delete(option)
    session.commit()
