"""Tests for PlaceDetails CRUD router."""

import pytest


class TestCreatePlaceDetails:
    """POST /api/places/{place_id}/details"""

    def test_create_details(self, client, test_user, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={
                "rating": 4.5,
                "tips": "Great views from the top floor",
                "subcategory": "museum",
                "address": "123 Rue de Rivoli, Paris",
                "contact_phone": "+33 1 40 20 50 50",
                "contact_website": "https://example.com",
                "contact_email": "info@example.com",
                "opening_hours": {"mon": "09:00-18:00"},
                "photos": ["photo1.jpg", "photo2.jpg"],
                "links": ["https://example.com/link1"],
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["rating"] == 4.5
        assert data["tips"] == "Great views from the top floor"
        assert data["subcategory"] == "museum"
        assert data["address"] == "123 Rue de Rivoli, Paris"
        assert data["contact_phone"] == "+33 1 40 20 50 50"
        assert data["contact_website"] == "https://example.com"
        assert data["contact_email"] == "info@example.com"
        assert data["opening_hours"] == {"mon": "09:00-18:00"}
        assert data["photos"] == ["photo1.jpg", "photo2.jpg"]
        assert data["links"] == ["https://example.com/link1"]
        assert data["place_id"] == test_place.id

    def test_create_details_minimal(self, client, test_user, test_place):
        """Creating details with only optional fields should work."""
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={"tips": "A small tip"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["tips"] == "A small tip"
        assert data["rating"] is None

    def test_create_details_duplicate(self, client, test_user, test_place):
        """Creating details when they already exist should return 409."""
        client.post(
            f"/api/places/{test_place.id}/details",
            json={"tips": "First"},
            headers=test_user["headers"],
        )
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={"tips": "Second"},
            headers=test_user["headers"],
        )
        assert response.status_code == 409

    def test_create_details_place_not_found(self, client, test_user):
        response = client.post(
            "/api/places/99999/details",
            json={"tips": "No place"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestGetPlaceDetails:
    """GET /api/places/{place_id}/details"""

    def test_get_details(self, client, test_user, test_place):
        client.post(
            f"/api/places/{test_place.id}/details",
            json={"rating": 3.0, "tips": "Nice spot"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/places/{test_place.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rating"] == 3.0
        assert data["tips"] == "Nice spot"
        assert data["place_id"] == test_place.id

    def test_get_details_not_found(self, client, test_user, test_place):
        response = client.get(
            f"/api/places/{test_place.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestUpdatePlaceDetails:
    """PUT /api/places/{place_id}/details"""

    def test_update_details(self, client, test_user, test_place):
        client.post(
            f"/api/places/{test_place.id}/details",
            json={"rating": 3.0, "tips": "Old tip"},
            headers=test_user["headers"],
        )
        response = client.put(
            f"/api/places/{test_place.id}/details",
            json={"rating": 4.0, "tips": "Updated tip", "address": "New address"},
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rating"] == 4.0
        assert data["tips"] == "Updated tip"
        assert data["address"] == "New address"

    def test_update_details_not_found(self, client, test_user, test_place):
        response = client.put(
            f"/api/places/{test_place.id}/details",
            json={"tips": "Nothing here"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestDeletePlaceDetails:
    """DELETE /api/places/{place_id}/details"""

    def test_delete_details(self, client, test_user, test_place):
        client.post(
            f"/api/places/{test_place.id}/details",
            json={"tips": "To be deleted"},
            headers=test_user["headers"],
        )
        response = client.delete(
            f"/api/places/{test_place.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        get_response = client.get(
            f"/api/places/{test_place.id}/details",
            headers=test_user["headers"],
        )
        assert get_response.status_code == 404

    def test_delete_details_not_found(self, client, test_user, test_place):
        response = client.delete(
            f"/api/places/{test_place.id}/details",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestPlaceDetailsAuth:
    """Authentication and authorization tests."""

    def test_unauthenticated_access(self, client, test_place):
        """Requests without auth should return 401."""
        response = client.get(f"/api/places/{test_place.id}/details")
        assert response.status_code == 401

    def test_unauthenticated_post(self, client, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={"tips": "No auth"},
        )
        assert response.status_code == 401


class TestPlaceDetailsValidation:
    """Validation tests for PlaceDetails."""

    def test_rating_too_high(self, client, test_user, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={"rating": 6.0},
            headers=test_user["headers"],
        )
        assert response.status_code == 422

    def test_rating_too_low(self, client, test_user, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={"rating": 0.5},
            headers=test_user["headers"],
        )
        assert response.status_code == 422

    def test_rating_boundary_low(self, client, test_user, test_place):
        """Rating of exactly 1.0 should be valid."""
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={"rating": 1.0},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        assert response.json()["rating"] == 1.0

    def test_rating_boundary_high(self, client, test_user, test_place):
        """Rating of exactly 5.0 should be valid."""
        response = client.post(
            f"/api/places/{test_place.id}/details",
            json={"rating": 5.0},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        assert response.json()["rating"] == 5.0
