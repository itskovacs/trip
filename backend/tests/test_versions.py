"""Tests for TripVersion CRUD endpoints."""

import json

import pytest


# ---------------------------------------------------------------------------
# Create version
# ---------------------------------------------------------------------------


class TestCreateVersion:
    """POST /api/trips/{trip_id}/versions"""

    def test_create_version(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "Before changes"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["label"] == "Before changes"
        assert data["trip_id"] == trip.id
        assert data["created_by"] == test_user["username"]
        assert data["created_at"] is not None
        assert data["snapshot_json"] is not None
        assert "id" in data

        # Verify snapshot contains trip data
        snapshot = json.loads(data["snapshot_json"])
        assert snapshot["trip"]["id"] == trip.id
        assert snapshot["trip"]["name"] == trip.name
        assert len(snapshot["days"]) == 1
        assert snapshot["days"][0]["label"] == "Day 1"
        assert len(snapshot["days"][0]["items"]) == 1

    def test_create_version_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/versions",
            json={},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["label"] is None
        assert data["snapshot_json"] is not None

    def test_create_version_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.post(
            "/api/trips/99999/versions",
            json={"label": "test"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404

    def test_create_multiple_versions(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp1 = client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "v1"},
            headers=test_user["headers"],
        )
        resp2 = client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "v2"},
            headers=test_user["headers"],
        )
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        assert resp1.json()["id"] != resp2.json()["id"]


# ---------------------------------------------------------------------------
# List versions
# ---------------------------------------------------------------------------


class TestListVersions:
    """GET /api/trips/{trip_id}/versions"""

    def test_list_versions(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "v1"},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "v2"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/versions",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_versions_empty(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/versions",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.json() == []

    def test_list_versions_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.get(
            "/api/trips/99999/versions",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Get version
# ---------------------------------------------------------------------------


class TestGetVersion:
    """GET /api/trips/{trip_id}/versions/{version_id}"""

    def test_get_version(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "snapshot"},
            headers=test_user["headers"],
        )
        version_id = create_resp.json()["id"]
        response = client.get(
            f"/api/trips/{trip.id}/versions/{version_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["label"] == "snapshot"
        assert data["snapshot_json"] is not None

    def test_get_version_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/versions/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Delete version
# ---------------------------------------------------------------------------


class TestDeleteVersion:
    """DELETE /api/trips/{trip_id}/versions/{version_id}"""

    def test_delete_version(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "to-delete"},
            headers=test_user["headers"],
        )
        version_id = create_resp.json()["id"]
        response = client.delete(
            f"/api/trips/{trip.id}/versions/{version_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        list_resp = client.get(
            f"/api/trips/{trip.id}/versions",
            headers=test_user["headers"],
        )
        assert list_resp.json() == []

    def test_delete_version_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/versions/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Auth – unauthenticated access
# ---------------------------------------------------------------------------


class TestVersionsAuth:
    """Unauthenticated access should return 401."""

    def test_unauthenticated_create(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/versions",
            json={"label": "test"},
        )
        assert response.status_code == 401

    def test_unauthenticated_list(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/versions",
        )
        assert response.status_code == 401

    def test_unauthenticated_get(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/versions/1",
        )
        assert response.status_code == 401

    def test_unauthenticated_delete(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/versions/1",
        )
        assert response.status_code == 401
