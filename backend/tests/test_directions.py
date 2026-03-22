"""Tests for Google Maps directions export endpoints."""

from datetime import date

import pytest

from trip.models.models import Category, Place, Trip, TripDay, TripItem, User
from trip.security import create_access_token, hash_password


# ---------------------------------------------------------------------------
# Day-level directions
# ---------------------------------------------------------------------------


class TestDayDirections:
    """GET /api/trips/{trip_id}/days/{day_id}/directions"""

    def test_returns_correct_url_with_two_stops(self, client, test_user, db):
        """Two items with coordinates produce a valid Google Maps URL."""
        trip = Trip(name="Istanbul Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Sultanahmet Day", trip_id=trip.id, dt=date(2026, 4, 10))
        db.add(day)
        db.commit()
        db.refresh(day)

        item1 = TripItem(time="09:00", text="Hagia Sophia", day_id=day.id, lat=41.0086, lng=28.9802)
        item2 = TripItem(time="12:00", text="Koftecisi", day_id=day.id, lat=41.0082, lng=28.9747)
        db.add_all([item1, item2])
        db.commit()

        resp = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["stop_count"] == 2
        assert "/maps/dir/" in data["google_maps_url"]
        assert "Hagia" in data["google_maps_url"]
        assert data["stops"][0]["name"] == "Hagia Sophia"
        assert data["stops"][0]["time"] == "09:00"
        assert data["stops"][1]["name"] == "Koftecisi"

    def test_uses_place_coordinates_when_linked(self, client, test_user, db):
        """If a TripItem links to a Place, use the Place's lat/lng."""
        cat = Category(name="Sights", user=test_user["username"])
        db.add(cat)
        db.commit()
        db.refresh(cat)

        place = Place(
            name="Blue Mosque", lat=41.0054, lng=28.9768, place="Istanbul",
            user=test_user["username"], category_id=cat.id,
        )
        db.add(place)
        db.commit()
        db.refresh(place)

        trip = Trip(name="Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        item = TripItem(
            time="10:00", text="Visit mosque", day_id=day.id,
            place_id=place.id, lat=0.0, lng=0.0,
        )
        db.add(item)
        db.commit()

        resp = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["stop_count"] == 1
        # Should use Place coords, not item coords
        assert data["stops"][0]["lat"] == 41.0054
        assert data["stops"][0]["lng"] == 28.9768
        assert data["stops"][0]["name"] == "Blue Mosque"

    def test_empty_when_no_coordinates(self, client, test_user, db):
        """A day whose items lack lat/lng returns empty stops."""
        trip = Trip(name="Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Empty Day", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        item = TripItem(time="09:00", text="No coords", day_id=day.id)
        db.add(item)
        db.commit()

        resp = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["stop_count"] == 0
        assert data["stops"] == []
        assert data["google_maps_url"] == ""

    def test_items_sorted_by_time(self, client, test_user, db):
        """Stops should appear sorted by time regardless of insertion order."""
        trip = Trip(name="Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day = TripDay(label="Day 1", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        # Insert in reverse time order
        item_late = TripItem(time="18:00", text="Dinner", day_id=day.id, lat=1.0, lng=2.0)
        item_early = TripItem(time="08:00", text="Breakfast", day_id=day.id, lat=3.0, lng=4.0)
        db.add_all([item_late, item_early])
        db.commit()

        resp = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["stops"][0]["time"] == "08:00"
        assert data["stops"][1]["time"] == "18:00"

    def test_day_not_found(self, client, test_user, db):
        trip = Trip(name="Trip", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        resp = client.get(
            f"/api/trips/{trip.id}/days/99999/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Trip-level directions
# ---------------------------------------------------------------------------


class TestTripDirections:
    """GET /api/trips/{trip_id}/directions"""

    def test_returns_all_days_with_urls(self, client, test_user, db):
        trip = Trip(name="Multi-day", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        day1 = TripDay(label="Day A", trip_id=trip.id, dt=date(2026, 5, 1))
        day2 = TripDay(label="Day B", trip_id=trip.id, dt=date(2026, 5, 2))
        db.add_all([day1, day2])
        db.commit()
        db.refresh(day1)
        db.refresh(day2)

        db.add(TripItem(time="09:00", text="S1", day_id=day1.id, lat=10.0, lng=20.0))
        db.add(TripItem(time="14:00", text="S2", day_id=day1.id, lat=11.0, lng=21.0))
        db.add(TripItem(time="10:00", text="S3", day_id=day2.id, lat=12.0, lng=22.0))
        db.commit()

        resp = client.get(
            f"/api/trips/{trip.id}/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["days"]) == 2

        d1 = data["days"][0]
        assert d1["label"] == "Day A"
        assert d1["date"] == "2026-05-01"
        assert d1["stop_count"] == 2
        assert "/maps/dir/" in d1["google_maps_url"]
        assert "S1" in d1["google_maps_url"]

        d2 = data["days"][1]
        assert d2["label"] == "Day B"
        assert d2["stop_count"] == 1

    def test_trip_with_no_days(self, client, test_user, db):
        trip = Trip(name="Empty", user=test_user["username"])
        db.add(trip)
        db.commit()
        db.refresh(trip)

        resp = client.get(
            f"/api/trips/{trip.id}/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        assert resp.json()["days"] == []


# ---------------------------------------------------------------------------
# Auth & ownership
# ---------------------------------------------------------------------------


class TestDirectionsAuth:
    """Unauthenticated / wrong-user access."""

    def test_unauthenticated_day_directions(self, client, db):
        # Need a trip in DB so route itself doesn't 404 before auth check
        user = User(username="owner", password=hash_password("pw"))
        db.add(user)
        db.commit()
        trip = Trip(name="T", user="owner")
        db.add(trip)
        db.commit()
        db.refresh(trip)
        day = TripDay(label="D", trip_id=trip.id)
        db.add(day)
        db.commit()
        db.refresh(day)

        resp = client.get(f"/api/trips/{trip.id}/days/{day.id}/directions")
        assert resp.status_code == 401

    def test_unauthenticated_trip_directions(self, client, db):
        user = User(username="owner2", password=hash_password("pw"))
        db.add(user)
        db.commit()
        trip = Trip(name="T", user="owner2")
        db.add(trip)
        db.commit()
        db.refresh(trip)

        resp = client.get(f"/api/trips/{trip.id}/directions")
        assert resp.status_code == 401

    def test_trip_not_found(self, client, test_user):
        resp = client.get(
            "/api/trips/99999/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 404

    def test_day_directions_trip_not_found(self, client, test_user):
        resp = client.get(
            "/api/trips/99999/days/1/directions",
            headers=test_user["headers"],
        )
        assert resp.status_code == 404
