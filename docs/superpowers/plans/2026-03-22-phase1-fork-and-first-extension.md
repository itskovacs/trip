# Phase 1: Fork, Foundation & First Extension

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork itskovacs/trip, set up the development environment, and implement the first extension (Rich Place Details) to validate the extension pattern for all future features.

**Architecture:** We fork the upstream repo, add an `extensions.py` models file with 1:1 extension tables (never modifying existing models), register new Alembic migrations, and add new FastAPI routers. This pattern will be reused for every subsequent feature.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Alembic, SQLite, pytest, Docker

**Spec:** `docs/superpowers/specs/2026-03-22-travelthing-design.md`

---

## File Structure

### Files to create
| File | Responsibility |
|------|---------------|
| `backend/trip/models/extensions.py` | All TravelThing extension SQLAlchemy models |
| `backend/trip/routers/place_details.py` | CRUD router for PlaceDetails |
| `backend/trip/routers/item_details.py` | CRUD router for TripItemDetails |
| `backend/tests/__init__.py` | Test package init |
| `backend/tests/conftest.py` | Shared pytest fixtures (test DB, client, auth) |
| `backend/tests/test_place_details.py` | Tests for PlaceDetails CRUD |
| `backend/tests/test_item_details.py` | Tests for TripItemDetails CRUD |
| `backend/trip/alembic/versions/001_add_extension_tables.py` | First migration: place_details + tripitem_details tables |
| `skill/trip.md` | Claude Code skill skeleton |
| `.env.example` | Example environment variables |

### Files to modify
| File | Change |
|------|--------|
| `backend/trip/main.py` | Register new routers |
| `backend/trip/models/__init__.py` | Import extension models so Alembic sees them |

---

## Task 1: Fork and Clone

**Files:**
- None (git operations only)

- [ ] **Step 1: Fork the repo on GitHub**

Run:
```bash
gh repo fork itskovacs/trip --clone=false
```

Expected: Fork created at `<your-username>/trip` on GitHub.

- [ ] **Step 2: Clone your fork into the TravelThing directory**

Since TravelThing directory already exists with our spec docs, we clone into a temp location and move:

```bash
cd /Users/dhlarge/Documents/Projects
git clone https://github.com/<your-username>/trip.git TravelThing-fork
# Move our docs into the fork
cp -r TravelThing/docs TravelThing-fork/
cp -r TravelThing/.git/refs TravelThing/.git/refs-backup 2>/dev/null || true
# Replace TravelThing with the fork
rm -rf TravelThing/.git
mv TravelThing-fork/.git TravelThing/.git
mv TravelThing-fork/* TravelThing/ 2>/dev/null || true
mv TravelThing-fork/.* TravelThing/ 2>/dev/null || true
rm -rf TravelThing-fork
cd TravelThing
```

**IMPORTANT:** The exact commands may vary. The key outcome is: TravelThing directory contains the forked trip repo with our `docs/` directory preserved.

- [ ] **Step 3: Set up upstream remote**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing
git remote add upstream https://github.com/itskovacs/trip.git
git fetch upstream
```

Expected: `git remote -v` shows both `origin` (your fork) and `upstream` (itskovacs/trip).

- [ ] **Step 4: Commit our docs to the fork**

```bash
git add docs/
git commit -m "Add TravelThing design spec and plans"
```

---

## Task 2: Run Locally and Verify

**Files:**
- Read: `docker-compose.yml`, `Dockerfile`, `backend/trip/requirements.txt`

- [ ] **Step 1: Read docker-compose.yml to understand the setup**

Read the file to understand ports, volumes, environment variables.

- [ ] **Step 2: Start the app with Docker**

```bash
docker-compose up --build -d
```

Expected: App running. Check with `docker-compose ps` — should show container(s) as "Up".

- [ ] **Step 3: Verify the app works**

Open `http://localhost:8000` in browser (or whatever port docker-compose exposes). You should see the TRIP welcome page or login screen.

- [ ] **Step 4: Create a test user**

The first user automatically gets admin rights. Register via the UI or check if there's an API endpoint.

- [ ] **Step 5: Stop Docker (we'll develop locally for faster iteration)**

```bash
docker-compose down
```

---

## Task 3: Explore the Codebase

**Files:**
- Read: `backend/trip/main.py`, `backend/trip/models/models.py`, `backend/trip/routers/trips.py`, `backend/trip/routers/places.py`, `backend/trip/deps.py`, `backend/trip/security.py`, `backend/trip/db/`, `backend/alembic.ini`

- [ ] **Step 1: Read main.py — understand how routers are registered**

Look for `app.include_router(...)` calls. Note the pattern: prefix, tags, dependencies.

- [ ] **Step 2: Read models.py — understand the full data model**

Note the exact field names, types, FKs, and relationships for `Place`, `TripItem`, `TripDay`, `Trip`.

- [ ] **Step 3: Read deps.py and security.py — understand authentication**

Find `get_current_user()` dependency. Note how JWT tokens are created and validated. Find the `api_token` handling.

- [ ] **Step 4: Read trips.py and places.py routers — understand the API patterns**

Note: request/response schemas (Pydantic models), CRUD patterns, how `current_user` is injected, error handling.

- [ ] **Step 5: Read alembic.ini and the alembic directory**

Understand the migration setup: where migrations are stored, database URL, naming conventions.

- [ ] **Step 6: Check if there are existing tests**

```bash
find backend/ -name "test_*" -o -name "*_test.py" | head -20
```

Note the testing patterns if any exist.

- [ ] **Step 7: Read requirements.txt**

Note all dependencies. Check if pytest is already included. Check SQLAlchemy version.

---

## Task 4: Set Up Local Development Environment

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create Python virtual environment**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing/backend
python3 -m venv venv
source venv/bin/activate
pip install -r trip/requirements.txt
pip install pytest httpx pytest-asyncio
```

Expected: All dependencies installed without errors.

- [ ] **Step 2: Create .env.example**

```bash
# .env.example - copy to .env and fill in values
TRIP_SECRET_KEY=your-secret-key-here
TRIP_DATABASE_URL=sqlite:///./storage/trip.sqlite
```

Note: Check `backend/trip/config.py` for the actual env var names and adjust accordingly.

- [ ] **Step 3: Verify the backend starts locally**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing/backend
source venv/bin/activate
uvicorn trip.main:app --reload --port 8000
```

Expected: FastAPI starts on port 8000. Visit `http://localhost:8000/docs` to see Swagger UI.

- [ ] **Step 4: Commit the .env.example**

```bash
git add .env.example
git commit -m "Add .env.example for local development"
```

---

## Task 5: Create Extension Models

**Files:**
- Create: `backend/trip/models/extensions.py`
- Modify: `backend/trip/models/__init__.py`

- [ ] **Step 1: Read models.py one more time to get the exact Base class and import pattern**

Note: What is the declarative base called? (`Base`? `SQLModel`?). How are relationships defined? What naming convention do columns use?

- [ ] **Step 2: Create extensions.py with PlaceDetails model**

Create `backend/trip/models/extensions.py`:

```python
"""TravelThing extension models.

All extension tables use 1:1 or many:1 FKs to existing upstream tables.
We never modify existing upstream models — only add new tables.
"""
from sqlalchemy import (
    Column, Integer, Float, String, Text, Boolean, Enum, ForeignKey, JSON, DateTime
)
from sqlalchemy.orm import relationship
import enum
from datetime import datetime

# Import the same Base as upstream models use
from .models import Base  # Adjust import based on what you find in Step 1


class Priority(str, enum.Enum):
    MUST_SEE = "must-see"
    SHOULD_SEE = "should-see"
    NICE_TO_HAVE = "nice-to-have"


class PlaceDetails(Base):
    """Extended metadata for a Place (1:1 relationship).

    Stores rich info that the upstream Place model doesn't have:
    opening hours, rating, photos, tips, contact info.
    """
    __tablename__ = "place_details"

    id = Column(Integer, primary_key=True)
    place_id = Column(Integer, ForeignKey("place.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    # Opening hours as JSON: {"schedule": [{"day": "mon", "open": "09:00", "close": "17:00"}, ...], "closed_dates": ["2026-04-23"], "last_entry": "16:00", "notes": "Ramadan hours may differ"}
    opening_hours = Column(JSON, nullable=True)

    rating = Column(Float, nullable=True)  # 1.0 - 5.0
    photos = Column(JSON, nullable=True)  # Array of URL strings
    tips = Column(Text, nullable=True)
    links = Column(JSON, nullable=True)  # Array of URL strings
    subcategory = Column(String, nullable=True)  # museum, park, cafe, etc.
    address = Column(String, nullable=True)
    contact_phone = Column(String, nullable=True)
    contact_website = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)

    # Relationship back to Place
    place = relationship("Place", backref="details", uselist=False)


class TripItemDetails(Base):
    """Extended scheduling metadata for a TripItem (1:1 relationship).

    Stores confirmation codes, priority, duration, alternative plans.
    """
    __tablename__ = "tripitem_details"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("tripitem.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    confirmation_code = Column(String, nullable=True)
    priority = Column(Enum(Priority), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    alternative_item_id = Column(Integer, ForeignKey("tripitem.id", ondelete="SET NULL"), nullable=True)
    alternative_reason = Column(String, nullable=True)

    # Relationships
    item = relationship("TripItem", foreign_keys=[item_id], backref="details", uselist=False)
    alternative = relationship("TripItem", foreign_keys=[alternative_item_id], uselist=False)
```

**IMPORTANT:** After reading the actual `models.py` in Task 3, you may need to adjust:
- The `Base` import path
- Relationship definitions to match upstream patterns
- Column types if upstream uses different SQLAlchemy style

- [ ] **Step 3: Update models/__init__.py to import extensions**

Add to `backend/trip/models/__init__.py`:

```python
from .extensions import PlaceDetails, TripItemDetails  # noqa: F401
```

This ensures Alembic can discover the new models for migration generation.

- [ ] **Step 4: Verify imports work**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing/backend
source venv/bin/activate
python -c "from trip.models.extensions import PlaceDetails, TripItemDetails; print('OK')"
```

Expected: `OK` with no import errors.

- [ ] **Step 5: Commit**

```bash
git add backend/trip/models/extensions.py backend/trip/models/__init__.py
git commit -m "feat: add PlaceDetails and TripItemDetails extension models"
```

---

## Task 6: Create Alembic Migration

**Files:**
- Create: `backend/trip/alembic/versions/001_add_extension_tables.py` (auto-generated)

- [ ] **Step 1: Check Alembic config for migration path**

```bash
cat backend/alembic.ini | grep script_location
cat backend/alembic.ini | grep sqlalchemy.url
```

Note the migration directory path and database URL pattern.

- [ ] **Step 2: Generate the migration**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing/backend
source venv/bin/activate
alembic revision --autogenerate -m "add place_details and tripitem_details tables"
```

Expected: A new migration file created in the alembic versions directory.

- [ ] **Step 3: Review the generated migration**

Read the generated file. Verify it creates:
- `place_details` table with all columns from the model
- `tripitem_details` table with all columns from the model
- Correct FK constraints and indexes

Fix any issues in the generated migration.

- [ ] **Step 4: Apply the migration**

```bash
alembic upgrade head
```

Expected: Migration applies successfully. Check with:
```bash
python -c "
import sqlite3
conn = sqlite3.connect('storage/trip.sqlite')  # Adjust path based on config
cursor = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")
for row in cursor: print(row[0])
conn.close()
"
```

Expected output should include `place_details` and `tripitem_details` among the tables.

- [ ] **Step 5: Commit**

```bash
git add backend/trip/alembic/
git commit -m "feat: add migration for place_details and tripitem_details tables"
```

---

## Task 7: Set Up Test Infrastructure

**Files:**
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`

- [ ] **Step 1: Create test package**

Create `backend/tests/__init__.py` (empty file).

- [ ] **Step 2: Create conftest.py with test fixtures**

Create `backend/tests/conftest.py`:

```python
"""Shared test fixtures for TravelThing extension tests."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Adjust these imports based on what you found in Task 3
from trip.main import app
from trip.models.models import Base
from trip.models.extensions import PlaceDetails, TripItemDetails
from trip.deps import get_db  # or however the DB session dependency is named


# In-memory SQLite for tests — StaticPool ensures all sessions share the same DB
from sqlalchemy.pool import StaticPool

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db():
    """Create tables, yield session, then drop tables."""
    Base.metadata.create_all(bind=engine)
    session = TestSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db):
    """FastAPI test client with overridden DB dependency."""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    """Create a test user and return auth headers."""
    # Adjust based on upstream User model and auth patterns
    from trip.models.models import User
    from trip.security import hash_password  # or whatever the password hashing function is

    user = User(
        username="testuser",
        password=hash_password("testpass123"),
        is_admin=False,
        currency="EUR",
        map_provider="OPENSTREETMAP",
    )
    db.add(user)
    db.commit()

    # Get JWT token
    # Adjust based on how the upstream creates tokens
    from trip.security import create_access_token
    token = create_access_token(data={"sub": user.username})

    return {"headers": {"Authorization": f"Bearer {token}"}, "user": user}


@pytest.fixture
def test_place(db, test_user):
    """Create a test Place and return it."""
    from trip.models.models import Place

    place = Place(
        name="Test Museum",
        lat=41.0086,
        lng=28.9802,
        user=test_user["user"].username,
        price=100.0,
        duration=120,
        description="A test museum",
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


@pytest.fixture
def test_trip_with_item(db, test_user):
    """Create a Trip with a Day and a TripItem, return all."""
    from trip.models.models import Trip, TripDay, TripItem
    from datetime import date

    trip = Trip(name="Test Trip", user=test_user["user"].username, currency="EUR")
    db.add(trip)
    db.commit()
    db.refresh(trip)

    day = TripDay(label="Day 1", dt=date(2026, 4, 10), trip_id=trip.id)
    db.add(day)
    db.commit()
    db.refresh(day)

    item = TripItem(
        text="Visit Museum",
        time="09:00",
        price=100.0,
        lat=41.0086,
        lng=28.9802,
        day_id=day.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {"trip": trip, "day": day, "item": item}
```

**IMPORTANT:** These fixtures are templates. After reading the actual codebase in Task 3, you MUST adjust:
- Import paths for models, deps, security
- Password hashing function name
- Token creation function name and parameters
- DB session dependency name
- User model required fields
- Any other patterns specific to the upstream codebase

- [ ] **Step 3: Verify test setup works**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing/backend
source venv/bin/activate
python -m pytest tests/ -v --co
```

Expected: pytest discovers the conftest.py. No collection errors.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/
git commit -m "feat: add test infrastructure with fixtures for extension testing"
```

---

## Task 8: Write PlaceDetails Router and Tests (TDD)

**Files:**
- Create: `backend/tests/test_place_details.py`
- Create: `backend/trip/routers/place_details.py`
- Modify: `backend/trip/main.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_place_details.py`:

```python
"""Tests for PlaceDetails CRUD endpoints."""


def test_create_place_details(client, test_user, test_place):
    """Creating PlaceDetails for a Place should work."""
    response = client.post(
        f"/api/places/{test_place.id}/details",
        json={
            "opening_hours": {
                "schedule": [
                    {"day": "mon", "open": "09:00", "close": "17:00"},
                    {"day": "tue", "open": "09:00", "close": "17:00"},
                ],
                "closed_dates": ["2026-04-23"],
                "last_entry": "16:00",
            },
            "rating": 4.8,
            "tips": "Go early to avoid crowds",
            "subcategory": "museum",
            "address": "Sultan Ahmet, Ayasofya Meydanı No:1",
            "contact_phone": "+90 212 522 1750",
            "contact_website": "https://muze.gen.tr",
            "photos": ["https://example.com/photo1.jpg"],
            "links": ["https://en.wikipedia.org/wiki/Hagia_Sophia"],
        },
        headers=test_user["headers"],
    )
    assert response.status_code == 201
    data = response.json()
    assert data["rating"] == 4.8
    assert data["tips"] == "Go early to avoid crowds"
    assert data["subcategory"] == "museum"
    assert data["place_id"] == test_place.id


def test_get_place_details(client, test_user, test_place, db):
    """Getting PlaceDetails for a Place should return the details."""
    from trip.models.extensions import PlaceDetails

    details = PlaceDetails(
        place_id=test_place.id,
        rating=4.5,
        tips="Test tip",
        subcategory="park",
    )
    db.add(details)
    db.commit()

    response = client.get(
        f"/api/places/{test_place.id}/details",
        headers=test_user["headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rating"] == 4.5
    assert data["tips"] == "Test tip"


def test_get_place_details_not_found(client, test_user, test_place):
    """Getting PlaceDetails when none exist should return 404."""
    response = client.get(
        f"/api/places/{test_place.id}/details",
        headers=test_user["headers"],
    )
    assert response.status_code == 404


def test_update_place_details(client, test_user, test_place, db):
    """Updating PlaceDetails should update the fields."""
    from trip.models.extensions import PlaceDetails

    details = PlaceDetails(place_id=test_place.id, rating=3.0)
    db.add(details)
    db.commit()

    response = client.put(
        f"/api/places/{test_place.id}/details",
        json={"rating": 4.9, "tips": "Updated tip"},
        headers=test_user["headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rating"] == 4.9
    assert data["tips"] == "Updated tip"


def test_delete_place_details(client, test_user, test_place, db):
    """Deleting PlaceDetails should remove them."""
    from trip.models.extensions import PlaceDetails

    details = PlaceDetails(place_id=test_place.id, rating=3.0)
    db.add(details)
    db.commit()

    response = client.delete(
        f"/api/places/{test_place.id}/details",
        headers=test_user["headers"],
    )
    assert response.status_code == 204

    # Verify it's gone
    response = client.get(
        f"/api/places/{test_place.id}/details",
        headers=test_user["headers"],
    )
    assert response.status_code == 404


def test_create_place_details_duplicate(client, test_user, test_place, db):
    """Creating PlaceDetails when they already exist should return 409."""
    from trip.models.extensions import PlaceDetails

    details = PlaceDetails(place_id=test_place.id, rating=3.0)
    db.add(details)
    db.commit()

    response = client.post(
        f"/api/places/{test_place.id}/details",
        json={"rating": 4.0},
        headers=test_user["headers"],
    )
    assert response.status_code == 409


def test_unauthenticated_access(client, test_place):
    """Accessing PlaceDetails without auth should return 401."""
    response = client.get(f"/api/places/{test_place.id}/details")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing/backend
python -m pytest tests/test_place_details.py -v
```

Expected: All tests FAIL (404 — routes don't exist yet).

- [ ] **Step 3: Create the PlaceDetails router**

Create `backend/trip/routers/place_details.py`:

```python
"""CRUD router for PlaceDetails — extended metadata for Places."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from pydantic import Field

# Adjust imports based on upstream patterns found in Task 3
from ..deps import get_db, get_current_user
from ..models.extensions import PlaceDetails
from ..models.models import Place, User

router = APIRouter(prefix="/api/places", tags=["place-details"])


# --- Pydantic Schemas ---

class OpeningHoursScheduleItem(BaseModel):
    day: str  # mon, tue, wed, thu, fri, sat, sun
    open: str  # HH:MM
    close: str  # HH:MM


class OpeningHours(BaseModel):
    schedule: list[OpeningHoursScheduleItem] = []
    closed_dates: list[str] = []
    last_entry: Optional[str] = None
    notes: Optional[str] = None


class PlaceDetailsCreate(BaseModel):
    opening_hours: Optional[OpeningHours] = None
    rating: Optional[float] = Field(None, ge=1.0, le=5.0)
    photos: Optional[list[str]] = None
    tips: Optional[str] = None
    links: Optional[list[str]] = None
    subcategory: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_website: Optional[str] = None
    contact_email: Optional[str] = None


class PlaceDetailsUpdate(BaseModel):
    opening_hours: Optional[OpeningHours] = None
    rating: Optional[float] = Field(None, ge=1.0, le=5.0)
    photos: Optional[list[str]] = None
    tips: Optional[str] = None
    links: Optional[list[str]] = None
    subcategory: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_website: Optional[str] = None
    contact_email: Optional[str] = None


class PlaceDetailsResponse(BaseModel):
    id: int
    place_id: int
    opening_hours: Optional[dict] = None
    rating: Optional[float] = None
    photos: Optional[list[str]] = None
    tips: Optional[str] = None
    links: Optional[list[str]] = None
    subcategory: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_website: Optional[str] = None
    contact_email: Optional[str] = None

    model_config = {"from_attributes": True}


# --- Helper ---

def _get_place_or_404(db: Session, place_id: int, user: User) -> Place:
    place = db.query(Place).filter(Place.id == place_id, Place.user == user.username).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    return place


# --- Endpoints ---

@router.post("/{place_id}/details", response_model=PlaceDetailsResponse, status_code=status.HTTP_201_CREATED)
def create_place_details(
    place_id: int,
    data: PlaceDetailsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_place_or_404(db, place_id, current_user)

    existing = db.query(PlaceDetails).filter(PlaceDetails.place_id == place_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="PlaceDetails already exist for this place")

    details = PlaceDetails(
        place_id=place_id,
        opening_hours=data.opening_hours.model_dump() if data.opening_hours else None,
        rating=data.rating,
        photos=data.photos,
        tips=data.tips,
        links=data.links,
        subcategory=data.subcategory,
        address=data.address,
        contact_phone=data.contact_phone,
        contact_website=data.contact_website,
        contact_email=data.contact_email,
    )
    db.add(details)
    db.commit()
    db.refresh(details)
    return details


@router.get("/{place_id}/details", response_model=PlaceDetailsResponse)
def get_place_details(
    place_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_place_or_404(db, place_id, current_user)

    details = db.query(PlaceDetails).filter(PlaceDetails.place_id == place_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="No details found for this place")
    return details


@router.put("/{place_id}/details", response_model=PlaceDetailsResponse)
def update_place_details(
    place_id: int,
    data: PlaceDetailsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_place_or_404(db, place_id, current_user)

    details = db.query(PlaceDetails).filter(PlaceDetails.place_id == place_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="No details found for this place")

    update_data = data.model_dump(exclude_unset=True)
    if "opening_hours" in update_data and update_data["opening_hours"] is not None:
        update_data["opening_hours"] = data.opening_hours.model_dump()

    for field, value in update_data.items():
        setattr(details, field, value)

    db.commit()
    db.refresh(details)
    return details


@router.delete("/{place_id}/details", status_code=status.HTTP_204_NO_CONTENT)
def delete_place_details(
    place_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_place_or_404(db, place_id, current_user)

    details = db.query(PlaceDetails).filter(PlaceDetails.place_id == place_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="No details found for this place")

    db.delete(details)
    db.commit()
```

- [ ] **Step 4: Register the router in main.py**

Add to `backend/trip/main.py` alongside existing router registrations:

```python
from .routers import place_details
app.include_router(place_details.router)
```

Match the pattern used by existing routers (check if they use dependencies, middleware, etc.).

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing/backend
python -m pytest tests/test_place_details.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/trip/routers/place_details.py backend/trip/main.py backend/tests/test_place_details.py
git commit -m "feat: add PlaceDetails CRUD router with tests"
```

---

## Task 9: Write TripItemDetails Router and Tests (TDD)

**Files:**
- Create: `backend/tests/test_item_details.py`
- Create: `backend/trip/routers/item_details.py`
- Modify: `backend/trip/main.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_item_details.py`:

```python
"""Tests for TripItemDetails CRUD endpoints."""


def test_create_item_details(client, test_user, test_trip_with_item):
    """Creating TripItemDetails for a TripItem should work."""
    item = test_trip_with_item["item"]
    trip = test_trip_with_item["trip"]

    response = client.post(
        f"/api/trips/{trip.id}/items/{item.id}/details",
        json={
            "confirmation_code": "HSM001",
            "priority": "must-see",
            "duration_minutes": 120,
        },
        headers=test_user["headers"],
    )
    assert response.status_code == 201
    data = response.json()
    assert data["confirmation_code"] == "HSM001"
    assert data["priority"] == "must-see"
    assert data["duration_minutes"] == 120
    assert data["item_id"] == item.id


def test_get_item_details(client, test_user, test_trip_with_item, db):
    """Getting TripItemDetails for a TripItem should return the details."""
    from trip.models.extensions import TripItemDetails

    item = test_trip_with_item["item"]
    trip = test_trip_with_item["trip"]

    details = TripItemDetails(
        item_id=item.id,
        confirmation_code="ABC123",
        priority="should-see",
    )
    db.add(details)
    db.commit()

    response = client.get(
        f"/api/trips/{trip.id}/items/{item.id}/details",
        headers=test_user["headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["confirmation_code"] == "ABC123"
    assert data["priority"] == "should-see"


def test_get_item_details_not_found(client, test_user, test_trip_with_item):
    """Getting details when none exist should return 404."""
    item = test_trip_with_item["item"]
    trip = test_trip_with_item["trip"]

    response = client.get(
        f"/api/trips/{trip.id}/items/{item.id}/details",
        headers=test_user["headers"],
    )
    assert response.status_code == 404


def test_update_item_details(client, test_user, test_trip_with_item, db):
    """Updating TripItemDetails should update the fields."""
    from trip.models.extensions import TripItemDetails

    item = test_trip_with_item["item"]
    trip = test_trip_with_item["trip"]

    details = TripItemDetails(item_id=item.id, priority="nice-to-have")
    db.add(details)
    db.commit()

    response = client.put(
        f"/api/trips/{trip.id}/items/{item.id}/details",
        json={"priority": "must-see", "confirmation_code": "NEW123"},
        headers=test_user["headers"],
    )
    assert response.status_code == 200
    data = response.json()
    assert data["priority"] == "must-see"
    assert data["confirmation_code"] == "NEW123"


def test_delete_item_details(client, test_user, test_trip_with_item, db):
    """Deleting TripItemDetails should remove them."""
    from trip.models.extensions import TripItemDetails

    item = test_trip_with_item["item"]
    trip = test_trip_with_item["trip"]

    details = TripItemDetails(item_id=item.id, priority="must-see")
    db.add(details)
    db.commit()

    response = client.delete(
        f"/api/trips/{trip.id}/items/{item.id}/details",
        headers=test_user["headers"],
    )
    assert response.status_code == 204
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_item_details.py -v
```

Expected: All tests FAIL.

- [ ] **Step 3: Create the TripItemDetails router**

Create `backend/trip/routers/item_details.py`:

```python
"""CRUD router for TripItemDetails — extended scheduling metadata for TripItems."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

# Adjust imports based on upstream patterns found in Task 3
from ..deps import get_db, get_current_user
from ..models.extensions import TripItemDetails, Priority
from ..models.models import Trip, TripItem, User

router = APIRouter(prefix="/api/trips", tags=["item-details"])


# --- Pydantic Schemas ---

class TripItemDetailsCreate(BaseModel):
    confirmation_code: Optional[str] = None
    priority: Optional[Priority] = None
    duration_minutes: Optional[int] = None
    alternative_item_id: Optional[int] = None
    alternative_reason: Optional[str] = None


class TripItemDetailsUpdate(BaseModel):
    confirmation_code: Optional[str] = None
    priority: Optional[Priority] = None
    duration_minutes: Optional[int] = None
    alternative_item_id: Optional[int] = None
    alternative_reason: Optional[str] = None


class TripItemDetailsResponse(BaseModel):
    id: int
    item_id: int
    confirmation_code: Optional[str] = None
    priority: Optional[str] = None
    duration_minutes: Optional[int] = None
    alternative_item_id: Optional[int] = None
    alternative_reason: Optional[str] = None

    model_config = {"from_attributes": True}


# --- Helpers ---

def _get_trip_or_404(db: Session, trip_id: int, user: User) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user == user.username).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def _get_item_or_404(db: Session, item_id: int, trip_id: int) -> TripItem:
    """Verify the item belongs to a day in the given trip."""
    from ..models.models import TripDay

    item = (
        db.query(TripItem)
        .join(TripDay, TripItem.day_id == TripDay.id)
        .filter(TripItem.id == item_id, TripDay.trip_id == trip_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in this trip")
    return item


# --- Endpoints ---

@router.post("/{trip_id}/items/{item_id}/details", response_model=TripItemDetailsResponse, status_code=status.HTTP_201_CREATED)
def create_item_details(
    trip_id: int,
    item_id: int,
    data: TripItemDetailsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_trip_or_404(db, trip_id, current_user)
    _get_item_or_404(db, item_id, trip_id)

    existing = db.query(TripItemDetails).filter(TripItemDetails.item_id == item_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Details already exist for this item")

    details = TripItemDetails(
        item_id=item_id,
        confirmation_code=data.confirmation_code,
        priority=data.priority,
        duration_minutes=data.duration_minutes,
        alternative_item_id=data.alternative_item_id,
        alternative_reason=data.alternative_reason,
    )
    db.add(details)
    db.commit()
    db.refresh(details)
    return details


@router.get("/{trip_id}/items/{item_id}/details", response_model=TripItemDetailsResponse)
def get_item_details(
    trip_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_trip_or_404(db, trip_id, current_user)
    _get_item_or_404(db, item_id, trip_id)

    details = db.query(TripItemDetails).filter(TripItemDetails.item_id == item_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="No details found for this item")
    return details


@router.put("/{trip_id}/items/{item_id}/details", response_model=TripItemDetailsResponse)
def update_item_details(
    trip_id: int,
    item_id: int,
    data: TripItemDetailsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_trip_or_404(db, trip_id, current_user)
    _get_item_or_404(db, item_id, trip_id)

    details = db.query(TripItemDetails).filter(TripItemDetails.item_id == item_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="No details found for this item")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(details, field, value)

    db.commit()
    db.refresh(details)
    return details


@router.delete("/{trip_id}/items/{item_id}/details", status_code=status.HTTP_204_NO_CONTENT)
def delete_item_details(
    trip_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_trip_or_404(db, trip_id, current_user)
    _get_item_or_404(db, item_id, trip_id)

    details = db.query(TripItemDetails).filter(TripItemDetails.item_id == item_id).first()
    if not details:
        raise HTTPException(status_code=404, detail="No details found for this item")

    db.delete(details)
    db.commit()
```

Key differences from `place_details.py`:
- Nested route: `/api/trips/{trip_id}/items/{item_id}/details`
- Must verify trip ownership AND item-trip membership (via TripDay join)
- Uses `Priority` enum for the `priority` field

- [ ] **Step 4: Register the router in main.py**

```python
from .routers import item_details
app.include_router(item_details.router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m pytest tests/test_item_details.py -v
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Run ALL tests to verify nothing is broken**

```bash
python -m pytest tests/ -v
```

Expected: All 12 tests PASS (7 from place_details + 5 from item_details).

- [ ] **Step 7: Commit**

```bash
git add backend/trip/routers/item_details.py backend/trip/main.py backend/tests/test_item_details.py
git commit -m "feat: add TripItemDetails CRUD router with tests"
```

---

## Task 10: Create Claude Code Skill Skeleton

**Files:**
- Create: `skill/trip.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p skill
```

- [ ] **Step 2: Create the skill definition**

Create `skill/trip.md`:

```markdown
---
name: trip
description: Manage trip plans via the TravelThing API. Use when the user wants to create, edit, or manage travel itineraries.
---

# TravelThing Trip Management Skill

You are a trip planning assistant that manages trips via the TravelThing FastAPI backend.

## API Configuration

The TravelThing backend runs at `http://localhost:8000`. Authentication uses JWT tokens obtained via username/password login.

## Available Actions

When the user asks to manage a trip, use the Bash tool to make HTTP requests to the API:

### Authentication
```bash
# Login and get JWT token
curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=<user>&password=<pass>"
```

### Trip Operations
- Create trip: `POST /api/trips/`
- List trips: `GET /api/trips/`
- Get trip: `GET /api/trips/{id}`
- Add day: `POST /api/trips/{id}/days/`
- Add item to day: `POST /api/trips/{id}/days/{day_id}/items/`

### Extension Operations (TravelThing)
- Add/get/update place details: `/api/places/{id}/details`
- Add/get/update item details: `/api/trips/{id}/items/{item_id}/details`

### Data Enrichment
When adding a place or item, use WebSearch to find:
- Coordinates (latitude, longitude)
- Opening hours
- Entry fees / prices
- Ratings
- Tips and recommendations
- Contact information

Then push this enriched data to the API.

## Usage Notes
- Always check if a Place already exists before creating a new one
- When creating a Place, also create a TripPlaceLink to associate it with the trip
- Use the existing category system for place categorization
```

- [ ] **Step 3: Commit**

```bash
git add skill/
git commit -m "feat: add Claude Code trip management skill skeleton"
```

---

## Task 11: Verify Full Docker Build

**Files:** None (Docker operations only)

- [ ] **Step 1: Build and run with Docker**

```bash
cd /Users/dhlarge/Documents/Projects/TravelThing
docker-compose up --build -d
```

Expected: Container starts without errors.

- [ ] **Step 2: Verify migrations run in Docker**

Check the container logs:
```bash
docker-compose logs | grep -i alembic
```

Expected: Migrations apply successfully, including our new tables.

- [ ] **Step 3: Verify API endpoints are accessible**

```bash
curl -s http://localhost:8000/docs | head -20
```

Expected: Swagger UI HTML. Our new endpoints (`/api/places/{id}/details`, `/api/trips/{id}/items/{item_id}/details`) should appear in the docs.

- [ ] **Step 4: Stop Docker**

```bash
docker-compose down
```

- [ ] **Step 5: Final commit — tag Phase 1 complete**

```bash
git add -A
git status  # Verify no sensitive files
git commit -m "chore: verify Docker build with extensions"
git tag v0.1.0-phase1
```

---

## Summary

After completing Phase 1, you will have:
1. A working fork of itskovacs/trip with upstream tracking
2. Two extension tables (`place_details`, `tripitem_details`) created via Alembic
3. Two CRUD routers with full test coverage (12+ tests)
4. A Claude Code skill skeleton ready for data enrichment
5. Everything running in Docker

**Next plan:** Phase 2 — Restaurant features, transport routes, reservations, and budget dashboard.
