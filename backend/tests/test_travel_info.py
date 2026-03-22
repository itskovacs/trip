"""Tests for TripTravelInfo CRUD endpoints."""

import pytest


# ---------------------------------------------------------------------------
# Create travel info
# ---------------------------------------------------------------------------


class TestCreateTravelInfo:
    """POST /api/trips/{trip_id}/travel-info"""

    def test_create_travel_info(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={
                "visa_required": True,
                "visa_notes": "Apply 30 days in advance",
                "vaccinations": ["Yellow Fever", "Hepatitis A"],
                "insurance_required": True,
                "embassy_name": "US Embassy Paris",
                "embassy_phone": "+33 1 43 12 22 22",
                "embassy_address": "2 Avenue Gabriel, 75008 Paris",
                "local_emergency_number": "112",
                "timezone": "Europe/Paris",
                "general_notes": "Carry passport copy separately",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["visa_required"] is True
        assert data["visa_notes"] == "Apply 30 days in advance"
        assert data["vaccinations"] == ["Yellow Fever", "Hepatitis A"]
        assert data["insurance_required"] is True
        assert data["embassy_name"] == "US Embassy Paris"
        assert data["timezone"] == "Europe/Paris"
        assert data["trip_id"] == trip.id
        assert "id" in data

    def test_create_travel_info_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["visa_required"] is None
        assert data["vaccinations"] is None
        assert data["timezone"] is None

    def test_create_travel_info_duplicate(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={"visa_required": False},
            headers=test_user["headers"],
        )
        response = client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={"visa_required": True},
            headers=test_user["headers"],
        )
        assert response.status_code == 409

    def test_create_travel_info_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.post(
            "/api/trips/99999/travel-info",
            json={"visa_required": False},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Get travel info
# ---------------------------------------------------------------------------


class TestGetTravelInfo:
    """GET /api/trips/{trip_id}/travel-info"""

    def test_get_travel_info(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={"visa_required": True, "timezone": "Asia/Tokyo"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/travel-info",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["visa_required"] is True
        assert data["timezone"] == "Asia/Tokyo"

    def test_get_travel_info_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/travel-info",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Update travel info
# ---------------------------------------------------------------------------


class TestUpdateTravelInfo:
    """PUT /api/trips/{trip_id}/travel-info"""

    def test_update_travel_info(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={
                "visa_required": True,
                "timezone": "Europe/Paris",
                "embassy_name": "US Embassy",
            },
            headers=test_user["headers"],
        )
        response = client.put(
            f"/api/trips/{trip.id}/travel-info",
            json={
                "visa_required": False,
                "insurance_provider": "TravelGuard",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["visa_required"] is False
        assert data["insurance_provider"] == "TravelGuard"
        # unchanged fields should persist
        assert data["timezone"] == "Europe/Paris"
        assert data["embassy_name"] == "US Embassy"

    def test_update_travel_info_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.put(
            f"/api/trips/{trip.id}/travel-info",
            json={"visa_required": False},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Delete travel info
# ---------------------------------------------------------------------------


class TestDeleteTravelInfo:
    """DELETE /api/trips/{trip_id}/travel-info"""

    def test_delete_travel_info(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={"visa_required": True},
            headers=test_user["headers"],
        )
        response = client.delete(
            f"/api/trips/{trip.id}/travel-info",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        get_resp = client.get(
            f"/api/trips/{trip.id}/travel-info",
            headers=test_user["headers"],
        )
        assert get_resp.status_code == 404

    def test_delete_travel_info_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/travel-info",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Auth – unauthenticated access
# ---------------------------------------------------------------------------


class TestTravelInfoAuth:
    """Unauthenticated access should return 401."""

    def test_unauthenticated_create(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/travel-info",
            json={"visa_required": False},
        )
        assert response.status_code == 401

    def test_unauthenticated_get(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/travel-info",
        )
        assert response.status_code == 401

    def test_unauthenticated_update(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.put(
            f"/api/trips/{trip.id}/travel-info",
            json={"visa_required": True},
        )
        assert response.status_code == 401

    def test_unauthenticated_delete(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/travel-info",
        )
        assert response.status_code == 401
