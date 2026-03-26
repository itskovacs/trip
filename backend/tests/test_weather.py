"""Tests for DayWeather CRUD endpoints."""

import pytest


# ---------------------------------------------------------------------------
# Create weather
# ---------------------------------------------------------------------------


class TestCreateWeather:
    """POST /api/trips/{trip_id}/days/{day_id}/weather"""

    def test_create_weather(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={
                "high_temp": 28.5,
                "low_temp": 18.0,
                "condition": "sunny",
                "rain_chance": 10,
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["high_temp"] == 28.5
        assert data["low_temp"] == 18.0
        assert data["condition"] == "sunny"
        assert data["rain_chance"] == 10
        assert data["day_id"] == day.id
        assert "id" in data

    def test_create_weather_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["high_temp"] is None
        assert data["low_temp"] is None
        assert data["condition"] is None
        assert data["rain_chance"] is None

    def test_create_weather_duplicate(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"condition": "sunny"},
            headers=test_user["headers"],
        )
        response = client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"condition": "rain"},
            headers=test_user["headers"],
        )
        assert response.status_code == 409

    def test_create_weather_trip_not_found(self, client, test_user, test_trip_with_item):
        day = test_trip_with_item["day"]
        response = client.post(
            f"/api/trips/99999/days/{day.id}/weather",
            json={"condition": "sunny"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404

    def test_create_weather_day_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/days/99999/weather",
            json={"condition": "sunny"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Get weather
# ---------------------------------------------------------------------------


class TestGetWeather:
    """GET /api/trips/{trip_id}/days/{day_id}/weather"""

    def test_get_weather(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"high_temp": 30.0, "condition": "cloudy"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["high_temp"] == 30.0
        assert data["condition"] == "cloudy"

    def test_get_weather_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Update weather
# ---------------------------------------------------------------------------


class TestUpdateWeather:
    """PUT /api/trips/{trip_id}/days/{day_id}/weather"""

    def test_update_weather(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"high_temp": 25.0, "condition": "sunny"},
            headers=test_user["headers"],
        )
        response = client.put(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"high_temp": 22.0, "rain_chance": 50},
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["high_temp"] == 22.0
        assert data["rain_chance"] == 50
        # condition should remain unchanged
        assert data["condition"] == "sunny"

    def test_update_weather_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.put(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"high_temp": 20.0},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Delete weather
# ---------------------------------------------------------------------------


class TestDeleteWeather:
    """DELETE /api/trips/{trip_id}/days/{day_id}/weather"""

    def test_delete_weather(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"condition": "rain"},
            headers=test_user["headers"],
        )
        response = client.delete(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        get_resp = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            headers=test_user["headers"],
        )
        assert get_resp.status_code == 404

    def test_delete_weather_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.delete(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Auth – unauthenticated access
# ---------------------------------------------------------------------------


class TestWeatherAuth:
    """Unauthenticated access should return 401."""

    def test_unauthenticated_create(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.post(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"condition": "sunny"},
        )
        assert response.status_code == 401

    def test_unauthenticated_get(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.get(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
        )
        assert response.status_code == 401

    def test_unauthenticated_update(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.put(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
            json={"condition": "rain"},
        )
        assert response.status_code == 401

    def test_unauthenticated_delete(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        response = client.delete(
            f"/api/trips/{trip.id}/days/{day.id}/weather",
        )
        assert response.status_code == 401
