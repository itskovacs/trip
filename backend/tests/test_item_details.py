"""Tests for TripItemDetails CRUD router."""

import pytest


class TestCreateTripItemDetails:
    """POST /api/trips/{trip_id}/items/{item_id}/details"""

    def test_create_details(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        response = client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={
                "confirmation_code": "ABC123",
                "priority": "must-see",
                "duration_minutes": 90,
                "alternative_reason": "Backup option",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["confirmation_code"] == "ABC123"
        assert data["priority"] == "must-see"
        assert data["duration_minutes"] == 90
        assert data["alternative_reason"] == "Backup option"
        assert data["item_id"] == item.id

    def test_create_details_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        response = client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"priority": "nice-to-have"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["priority"] == "nice-to-have"
        assert data["confirmation_code"] is None

    def test_create_details_duplicate(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"priority": "must-see"},
            headers=test_user["headers"],
        )
        response = client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"priority": "should-see"},
            headers=test_user["headers"],
        )
        assert response.status_code == 409

    def test_create_details_trip_not_found(self, client, test_user, test_trip_with_item):
        item = test_trip_with_item["item"]
        response = client.post(
            f"/api/trips/99999/items/{item.id}/details",
            json={"priority": "must-see"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404

    def test_create_details_item_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/items/99999/details",
            json={"priority": "must-see"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404

    def test_create_details_invalid_priority(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        response = client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"priority": "invalid-priority"},
            headers=test_user["headers"],
        )
        assert response.status_code == 422


class TestGetTripItemDetails:
    """GET /api/trips/{trip_id}/items/{item_id}/details"""

    def test_get_details(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"confirmation_code": "XYZ789", "priority": "should-see"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["confirmation_code"] == "XYZ789"
        assert data["priority"] == "should-see"
        assert data["item_id"] == item.id

    def test_get_details_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        response = client.get(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestUpdateTripItemDetails:
    """PUT /api/trips/{trip_id}/items/{item_id}/details"""

    def test_update_details(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"priority": "must-see", "duration_minutes": 60},
            headers=test_user["headers"],
        )
        response = client.put(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={
                "priority": "should-see",
                "duration_minutes": 120,
                "confirmation_code": "UPDATED",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["priority"] == "should-see"
        assert data["duration_minutes"] == 120
        assert data["confirmation_code"] == "UPDATED"

    def test_update_details_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        response = client.put(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"priority": "must-see"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestDeleteTripItemDetails:
    """DELETE /api/trips/{trip_id}/items/{item_id}/details"""

    def test_delete_details(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        client.post(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            json={"priority": "must-see"},
            headers=test_user["headers"],
        )
        response = client.delete(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        get_response = client.get(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            headers=test_user["headers"],
        )
        assert get_response.status_code == 404

    def test_delete_details_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        response = client.delete(
            f"/api/trips/{trip.id}/items/{item.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestTripItemDetailsAuth:
    """Authentication tests."""

    def test_unauthenticated_access(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        item = test_trip_with_item["item"]
        response = client.get(f"/api/trips/{trip.id}/items/{item.id}/details")
        assert response.status_code == 401
