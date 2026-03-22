"""CRUD router for trip budget entries, budget summary, and exchange rates."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..deps import SessionDep, get_current_username
from ..models.extensions import ExchangeRate, TripBudget
from ..models.models import Trip, TripDay, TripItem

router = APIRouter(tags=["budget"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _verify_trip(session, trip_id: int, current_user: str) -> Trip:
    """Verify trip exists and is owned by the current user."""
    trip = session.get(Trip, trip_id)
    if not trip or trip.user != current_user:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


# ---------------------------------------------------------------------------
# Pydantic schemas – Budget
# ---------------------------------------------------------------------------


class BudgetCreate(BaseModel):
    category: str
    planned_amount: float
    currency: str | None = None


class BudgetUpdate(BaseModel):
    category: str | None = None
    planned_amount: float | None = None
    currency: str | None = None


class BudgetRead(BaseModel):
    id: int
    trip_id: int
    category: str
    planned_amount: float
    currency: str | None = None


# ---------------------------------------------------------------------------
# Pydantic schemas – Budget Summary
# ---------------------------------------------------------------------------


class BudgetSummary(BaseModel):
    planned_total: float
    actual_total: float
    breakdown_by_category: dict[str, float]
    per_day: dict[str, float]


# ---------------------------------------------------------------------------
# Pydantic schemas – Exchange Rate
# ---------------------------------------------------------------------------


class ExchangeRateCreate(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    fetched_at: str | None = None


class ExchangeRateRead(BaseModel):
    id: int
    from_currency: str
    to_currency: str
    rate: float
    fetched_at: str | None = None


# ---------------------------------------------------------------------------
# Budget CRUD endpoints
# ---------------------------------------------------------------------------

budget_router = APIRouter(prefix="/api/trips", tags=["budget"])


@budget_router.post("/{trip_id}/budget", response_model=BudgetRead, status_code=201)
def create_budget(
    trip_id: int,
    body: BudgetCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)
    budget = TripBudget(trip_id=trip_id, **body.model_dump())
    session.add(budget)
    session.commit()
    session.refresh(budget)
    return budget


@budget_router.get("/{trip_id}/budget", response_model=list[BudgetRead])
def list_budget(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)
    entries = session.exec(
        select(TripBudget).where(TripBudget.trip_id == trip_id)
    ).all()
    return entries


@budget_router.put("/{trip_id}/budget/{budget_id}", response_model=BudgetRead)
def update_budget(
    trip_id: int,
    budget_id: int,
    body: BudgetUpdate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)
    budget = session.get(TripBudget, budget_id)
    if not budget or budget.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Budget entry not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(budget, key, value)

    session.add(budget)
    session.commit()
    session.refresh(budget)
    return budget


@budget_router.delete("/{trip_id}/budget/{budget_id}", status_code=204)
def delete_budget(
    trip_id: int,
    budget_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)
    budget = session.get(TripBudget, budget_id)
    if not budget or budget.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Budget entry not found")
    session.delete(budget)
    session.commit()


# ---------------------------------------------------------------------------
# Budget Summary endpoint
# ---------------------------------------------------------------------------


@budget_router.get("/{trip_id}/budget/summary", response_model=BudgetSummary)
def budget_summary(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _verify_trip(session, trip_id, current_user)

    # Planned totals by category
    budget_entries = session.exec(
        select(TripBudget).where(TripBudget.trip_id == trip_id)
    ).all()

    planned_total = sum(e.planned_amount for e in budget_entries)
    breakdown_by_category: dict[str, float] = {}
    for entry in budget_entries:
        breakdown_by_category[entry.category] = (
            breakdown_by_category.get(entry.category, 0.0) + entry.planned_amount
        )

    # Actual spend: sum of TripItem.price across all TripDays for this trip
    days = session.exec(
        select(TripDay).where(TripDay.trip_id == trip_id)
    ).all()

    actual_total = 0.0
    per_day: dict[str, float] = {}
    for day in days:
        items = session.exec(
            select(TripItem).where(TripItem.day_id == day.id)
        ).all()
        day_total = sum(item.price for item in items if item.price is not None)
        if day_total > 0:
            per_day[day.label] = day_total
        actual_total += day_total

    return BudgetSummary(
        planned_total=planned_total,
        actual_total=actual_total,
        breakdown_by_category=breakdown_by_category,
        per_day=per_day,
    )


# ---------------------------------------------------------------------------
# Exchange Rate endpoints (standalone, not trip-scoped)
# ---------------------------------------------------------------------------

exchange_router = APIRouter(prefix="/api/exchange-rates", tags=["budget"])


@exchange_router.post("", response_model=ExchangeRateRead, status_code=201)
def create_exchange_rate(
    body: ExchangeRateCreate,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    rate = ExchangeRate(**body.model_dump())
    session.add(rate)
    session.commit()
    session.refresh(rate)
    return rate


@exchange_router.get("", response_model=list[ExchangeRateRead])
def list_exchange_rates(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    rates = session.exec(select(ExchangeRate)).all()
    return rates


# Combine both sub-routers into one module-level router
router.include_router(budget_router)
router.include_router(exchange_router)
