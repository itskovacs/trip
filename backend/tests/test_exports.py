"""Tests for calendar export, route optimization, and cost settlement endpoints."""

from datetime import date, datetime, UTC

import pytest

from trip.models.models import (
    Category,
    Place,
    Trip,
    TripDay,
    TripItem,
    TripMember,
    User,
)
from trip.security import hash_password


# ---------------------------------------------------------------------------
# Calendar Export (.ics)
# ---------------------------------------------------------------------------


class TestCalendarExport:
    """GET /api/trips/{trip_id}/export/ical"""

    def test_ical_generates_valid_output(self, client, test_user, test_trip_with_item, db):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]

        # Give the day a date so it can generate all-day events
        day.dt = date(2026, 4, 10)
        db.add(day)

        # Give the item a price and place for richer output
        item = test_trip_with_item["item"]
        item.price = 500.0
        db.add(item)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/export/ical",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/calendar; charset=utf-8"
        assert "attachment" in response.headers.get("content-disposition", "")

        body = response.text
        assert "BEGIN:VCALENDAR" in body
        assert "END:VCALENDAR" in body
        assert "BEGIN:VEVENT" in body
        assert "END:VEVENT" in body
        assert "Visit museum" in body

    def test_ical_item_with_start_time_only(self, client, test_user, test_trip_with_item, db):
        """Items with only a start time should become 1-hour events."""
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        day.dt = date(2026, 4, 10)
        db.add(day)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/export/ical",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        body = response.text
        # 09:00 start -> 10:00 end (1 hour default)
        assert "DTSTART:20260410T090000" in body
        assert "DTEND:20260410T100000" in body

    def test_ical_empty_trip(self, client, test_user, db):
        """A trip with no days should still return a valid .ics file."""
        trip = Trip(name="Empty Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        response = client.get(
            f"/api/trips/{trip.id}/export/ical",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        body = response.text
        assert "BEGIN:VCALENDAR" in body
        assert "END:VCALENDAR" in body
        # No events
        assert "BEGIN:VEVENT" not in body

    def test_ical_unauthenticated(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(f"/api/trips/{trip.id}/export/ical")
        assert response.status_code == 401

    def test_ical_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.get(
            "/api/trips/99999/export/ical",
            headers=test_user["headers"],
        )
        assert response.status_code == 404

    def test_ical_day_with_date_creates_all_day_event(self, client, test_user, db):
        """A day with a date but no items should produce an all-day VEVENT."""
        trip = Trip(name="Day Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Sightseeing Day", trip_id=trip.id, dt=date(2026, 5, 1))
        db.add(day)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/export/ical",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        body = response.text
        assert "Sightseeing Day" in body
        assert "DTSTART;VALUE=DATE:20260501" in body


# ---------------------------------------------------------------------------
# Route Optimization
# ---------------------------------------------------------------------------


class TestRouteOptimization:
    """POST /api/trips/{trip_id}/days/{day_id}/optimize"""

    def test_optimize_three_points(self, client, test_user, db):
        """With 3+ geolocated items, should return optimized order and distances."""
        trip = Trip(name="Geo Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        # Create 3 items with lat/lng in a pattern where nearest-neighbor
        # produces a different order than the original.
        # A (0,0) -> C (0,2) -> B (0,1): original order A, C, B
        # Nearest-neighbor from A: A -> B -> C (shorter)
        items = [
            TripItem(time="09:00", text="A", day_id=day.id, lat=0.0, lng=0.0),
            TripItem(time="10:00", text="C", day_id=day.id, lat=0.0, lng=2.0),
            TripItem(time="11:00", text="B", day_id=day.id, lat=0.0, lng=1.0),
        ]
        for item in items:
            db.add(item)
        db.commit()

        response = client.post(
            f"/api/trips/{trip.id}/days/{day.id}/optimize",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()

        assert "original_order" in data
        assert "optimized_order" in data
        assert "original_distance_km" in data
        assert "optimized_distance_km" in data
        assert "savings_km" in data

        # Original order: A, C, B  (distance 0->2 + 2->1 = ~333 km)
        # Optimized order: A, B, C (distance 0->1 + 1->2 = ~222 km)
        opt_names = [p["name"] for p in data["optimized_order"]]
        assert opt_names == ["A", "B", "C"]
        assert data["optimized_distance_km"] < data["original_distance_km"]
        assert data["savings_km"] > 0

    def test_optimize_fewer_than_two_points(self, client, test_user, db):
        """With fewer than 2 geolocated items, should return equal original/optimized."""
        trip = Trip(name="Small Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        # Only one item with location
        item = TripItem(time="09:00", text="Solo", day_id=day.id, lat=41.0, lng=29.0)
        db.add(item)
        db.commit()

        response = client.post(
            f"/api/trips/{trip.id}/days/{day.id}/optimize",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["original_order"]) == 1
        assert data["original_distance_km"] == 0.0
        assert data["optimized_distance_km"] == 0.0
        assert data["savings_km"] == 0.0

    def test_optimize_uses_place_coordinates(self, client, test_user, db):
        """Items without own lat/lng should fall back to linked place coordinates."""
        cat = Category(name="Cat", user=test_user["username"])
        db.add(cat)
        db.commit()
        db.refresh(cat)

        place = Place(
            name="Museum", lat=41.0, lng=29.0,
            place="Istanbul", user=test_user["username"], category_id=cat.id,
        )
        db.add(place)
        db.commit()
        db.refresh(place)

        trip = Trip(name="Place Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        item1 = TripItem(time="09:00", text="Start", day_id=day.id, lat=40.0, lng=28.0)
        item2 = TripItem(time="10:00", text="Museum Visit", day_id=day.id, place_id=place.id)
        db.add(item1)
        db.add(item2)
        db.commit()

        response = client.post(
            f"/api/trips/{trip.id}/days/{day.id}/optimize",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["original_order"]) == 2
        # The place-linked item should have the place's coordinates
        museum_item = [i for i in data["original_order"] if i["name"] == "Museum Visit"][0]
        assert museum_item["lat"] == 41.0
        assert museum_item["lng"] == 29.0

    def test_optimize_unauthenticated(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.post(f"/api/trips/{trip.id}/days/{day.id}/optimize")
        assert response.status_code == 401

    def test_optimize_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.post(
            "/api/trips/99999/days/1/optimize",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Cost Settlement
# ---------------------------------------------------------------------------


class TestCostSettlement:
    """GET /api/trips/{trip_id}/settlement"""

    def test_settlement_two_members(self, client, test_user, db):
        """Correct split when two members have different payments."""
        # Create a second user
        user2 = User(username="ayse", password=hash_password("pass"))
        db.add(user2)
        db.commit()

        trip = Trip(name="Shared Trip", user=test_user["username"], currency="TRY")
        db.add(trip)
        db.commit()
        db.refresh(trip)

        # Add second user as a member
        member = TripMember(
            user="ayse",
            trip_id=trip.id,
            invited_by=test_user["username"],
            joined_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        db.add(member)
        db.commit()

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        # testuser paid 1000, ayse paid 500 -> total 1500, per person 750
        # testuser balance: 1000 - 750 = +250
        # ayse balance: 500 - 750 = -250
        item1 = TripItem(
            time="09:00", text="Hotel", day_id=day.id,
            price=1000.0, paid_by=test_user["username"],
        )
        item2 = TripItem(
            time="12:00", text="Lunch", day_id=day.id,
            price=500.0, paid_by="ayse",
        )
        db.add(item1)
        db.add(item2)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/settlement",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()

        assert data["total_cost"] == 1500.0
        assert data["currency"] == "TRY"
        assert set(data["members"]) == {"testuser", "ayse"}
        assert data["per_person"] == 750.0
        assert data["balances"]["testuser"] == 250.0
        assert data["balances"]["ayse"] == -250.0

        assert len(data["settlements"]) == 1
        s = data["settlements"][0]
        assert s["from"] == "ayse"
        assert s["to"] == "testuser"
        assert s["amount"] == 250.0

    def test_settlement_no_paid_items(self, client, test_user, db):
        """When no items have paid_by set, totals should be zero."""
        trip = Trip(name="Free Trip", user=test_user["username"], currency="EUR")
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        # Item with price but no paid_by
        item = TripItem(time="09:00", text="Free stuff", day_id=day.id, price=100.0)
        db.add(item)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/settlement",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_cost"] == 0.0
        assert data["settlements"] == []

    def test_settlement_unauthenticated(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(f"/api/trips/{trip.id}/settlement")
        assert response.status_code == 401

    def test_settlement_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.get(
            "/api/trips/99999/settlement",
            headers=test_user["headers"],
        )
        assert response.status_code == 404

    def test_settlement_even_split(self, client, test_user, db):
        """When everyone paid equally, settlements should be empty."""
        user2 = User(username="even_user", password=hash_password("pass"))
        db.add(user2)
        db.commit()

        trip = Trip(name="Even Trip", user=test_user["username"], currency="USD")
        db.add(trip)
        db.commit()
        db.refresh(trip)

        member = TripMember(
            user="even_user",
            trip_id=trip.id,
            invited_by=test_user["username"],
            joined_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        db.add(member)
        db.commit()

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        # Each pays exactly their share
        item1 = TripItem(
            time="09:00", text="Item A", day_id=day.id,
            price=100.0, paid_by=test_user["username"],
        )
        item2 = TripItem(
            time="10:00", text="Item B", day_id=day.id,
            price=100.0, paid_by="even_user",
        )
        db.add(item1)
        db.add(item2)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/settlement",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_cost"] == 200.0
        assert data["per_person"] == 100.0
        assert data["settlements"] == []
