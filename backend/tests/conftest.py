"""Test infrastructure: fixtures for in-memory SQLite, FastAPI TestClient, and test data."""

import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

# ---------------------------------------------------------------------------
# Ensure the frontend folder exists so that ``trip.main`` can be imported
# without raising ValueError at module level.  We also create the assets and
# attachments directories it expects.
# ---------------------------------------------------------------------------
_tmpdir = tempfile.mkdtemp()
os.environ.setdefault("FRONTEND_FOLDER", str(Path(_tmpdir) / "frontend"))
os.environ.setdefault("ASSETS_FOLDER", str(Path(_tmpdir) / "assets"))
os.environ.setdefault("ATTACHMENTS_FOLDER", str(Path(_tmpdir) / "attachments"))
os.environ.setdefault("BACKUPS_FOLDER", str(Path(_tmpdir) / "backups"))

Path(os.environ["FRONTEND_FOLDER"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["ASSETS_FOLDER"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["ATTACHMENTS_FOLDER"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["BACKUPS_FOLDER"]).mkdir(parents=True, exist_ok=True)

# Clear cached settings so our env vars take effect
from trip.config import get_settings  # noqa: E402

get_settings.cache_clear()

from fastapi.testclient import TestClient  # noqa: E402

from trip.deps import get_session  # noqa: E402
from trip.main import app  # noqa: E402
from trip.models.models import (  # noqa: E402
    Category,
    Place,
    Trip,
    TripDay,
    TripItem,
    User,
)
from trip.security import create_access_token, hash_password  # noqa: E402

# ---------------------------------------------------------------------------
# In-memory SQLite engine shared across the entire test session.  StaticPool
# is *required* so that every ``Session(engine)`` in the same process talks
# to the same in-memory database.
# ---------------------------------------------------------------------------
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


def get_session_override():
    """Dependency override: yield a Session bound to the test engine."""
    with Session(engine) as session:
        yield session


# Wire the override into the FastAPI app *once* at import time.
app.dependency_overrides[get_session] = get_session_override


# ---------------------------------------------------------------------------
# Core fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db():
    """Create all tables, yield a Session, then drop everything for isolation."""
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    SQLModel.metadata.drop_all(engine)


@pytest.fixture()
def client(db):
    """FastAPI TestClient with dependency overrides already in place."""
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Data fixtures
# ---------------------------------------------------------------------------

TEST_USERNAME = "testuser"
TEST_PASSWORD = "testpass123"


@pytest.fixture()
def test_user(db: Session) -> dict:
    """Insert a User row and return ``{"headers": {...}, "username": ...}``."""
    user = User(
        username=TEST_USERNAME,
        password=hash_password(TEST_PASSWORD),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.username})
    return {
        "username": user.username,
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest.fixture()
def test_category(db: Session, test_user: dict) -> Category:
    """Create a minimal Category owned by the test user."""
    cat = Category(
        name="Test Category",
        user=test_user["username"],
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@pytest.fixture()
def test_place(db: Session, test_user: dict, test_category: Category) -> Place:
    """Create a minimal Place owned by the test user."""
    place = Place(
        name="Test Place",
        lat=48.8566,
        lng=2.3522,
        place="Paris, France",
        user=test_user["username"],
        category_id=test_category.id,
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


@pytest.fixture()
def test_trip_with_item(
    db: Session,
    test_user: dict,
    test_place: Place,
) -> dict:
    """Create Trip -> TripDay -> TripItem and return all three objects."""
    trip = Trip(name="Test Trip", user=test_user["username"])
    db.add(trip)
    db.commit()
    db.refresh(trip)

    day = TripDay(label="Day 1", trip_id=trip.id)
    db.add(day)
    db.commit()
    db.refresh(day)

    item = TripItem(
        time="09:00",
        text="Visit museum",
        day_id=day.id,
        place_id=test_place.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {"trip": trip, "day": day, "item": item}
