"""Tests for Transport Routes CRUD router (ItemRoute, RouteOption)."""

import pytest

from trip.models.models import TripItem


# ---------------------------------------------------------------------------
# Helper: create a second TripItem for route endpoints
# ---------------------------------------------------------------------------


@pytest.fixture()
def second_item(db, test_trip_with_item, test_place):
    """Add a second TripItem to the same day so we can create routes."""
    day = test_trip_with_item["day"]
    item = TripItem(
        time="10:00",
        text="Visit park",
        day_id=day.id,
        place_id=test_place.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# ---------------------------------------------------------------------------
# Helper: create a route via the API
# ---------------------------------------------------------------------------


def _create_route(client, trip_id, from_id, to_id, day_id, headers, **kwargs):
    payload = {
        "from_item_id": from_id,
        "to_item_id": to_id,
        "day_id": day_id,
        **kwargs,
    }
    return client.post(
        f"/api/trips/{trip_id}/routes",
        json=payload,
        headers=headers,
    )


# ---------------------------------------------------------------------------
# ItemRoute tests
# ---------------------------------------------------------------------------


class TestCreateRoute:
    """POST /api/trips/{trip_id}/routes"""

    def test_create_route(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        item_a = test_trip_with_item["item"]
        item_b = second_item

        resp = _create_route(
            client,
            trip.id,
            item_a.id,
            item_b.id,
            day.id,
            test_user["headers"],
            recommended_mode="walking",
            notes="Short walk",
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["from_item_id"] == item_a.id
        assert data["to_item_id"] == item_b.id
        assert data["day_id"] == day.id
        assert data["recommended_mode"] == "walking"
        assert data["notes"] == "Short walk"
        assert "id" in data

    def test_create_route_minimal(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["recommended_mode"] is None
        assert data["notes"] is None

    def test_create_route_trip_not_found(self, client, test_user, test_trip_with_item, second_item):
        day = test_trip_with_item["day"]
        resp = _create_route(
            client,
            99999,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        assert resp.status_code == 404


class TestListRoutes:
    """GET /api/trips/{trip_id}/routes"""

    def test_list_routes(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        item_a = test_trip_with_item["item"]
        item_b = second_item

        _create_route(client, trip.id, item_a.id, item_b.id, day.id, test_user["headers"])
        _create_route(client, trip.id, item_b.id, item_a.id, day.id, test_user["headers"])

        resp = client.get(
            f"/api/trips/{trip.id}/routes",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_list_routes_empty(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp = client.get(
            f"/api/trips/{trip.id}/routes",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        assert resp.json() == []


class TestGetRoute:
    """GET /api/trips/{trip_id}/routes/{route_id}"""

    def test_get_route(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        create_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
            recommended_mode="transit",
        )
        route_id = create_resp.json()["id"]

        resp = client.get(
            f"/api/trips/{trip.id}/routes/{route_id}",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == route_id
        assert data["recommended_mode"] == "transit"
        assert "options" in data

    def test_get_route_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp = client.get(
            f"/api/trips/{trip.id}/routes/99999",
            headers=test_user["headers"],
        )
        assert resp.status_code == 404


class TestDeleteRoute:
    """DELETE /api/trips/{trip_id}/routes/{route_id}"""

    def test_delete_route(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        create_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        route_id = create_resp.json()["id"]

        resp = client.delete(
            f"/api/trips/{trip.id}/routes/{route_id}",
            headers=test_user["headers"],
        )
        assert resp.status_code == 204

        # Verify it's gone
        get_resp = client.get(
            f"/api/trips/{trip.id}/routes/{route_id}",
            headers=test_user["headers"],
        )
        assert get_resp.status_code == 404

    def test_delete_route_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp = client.delete(
            f"/api/trips/{trip.id}/routes/99999",
            headers=test_user["headers"],
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# RouteOption tests
# ---------------------------------------------------------------------------


class TestCreateRouteOption:
    """POST /api/trips/{trip_id}/routes/{route_id}/options"""

    def test_create_option(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        route_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        route_id = route_resp.json()["id"]

        resp = client.post(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            json={
                "mode": "bus",
                "duration_minutes": 25,
                "distance_km": 3.5,
                "cost": 2.50,
                "line_name": "Line 42",
                "notes": "Runs every 10 min",
                "recommended": True,
            },
            headers=test_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["mode"] == "bus"
        assert data["duration_minutes"] == 25
        assert data["distance_km"] == 3.5
        assert data["cost"] == 2.50
        assert data["line_name"] == "Line 42"
        assert data["notes"] == "Runs every 10 min"
        assert data["recommended"] is True
        assert data["route_id"] == route_id
        assert "id" in data

    def test_create_option_minimal(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        route_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        route_id = route_resp.json()["id"]

        resp = client.post(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            json={"mode": "walking"},
            headers=test_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["mode"] == "walking"
        assert data["duration_minutes"] is None
        assert data["recommended"] is False

    def test_create_option_route_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp = client.post(
            f"/api/trips/{trip.id}/routes/99999/options",
            json={"mode": "bus"},
            headers=test_user["headers"],
        )
        assert resp.status_code == 404


class TestListRouteOptions:
    """GET /api/trips/{trip_id}/routes/{route_id}/options"""

    def test_list_options(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        route_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        route_id = route_resp.json()["id"]

        client.post(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            json={"mode": "bus"},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            json={"mode": "metro"},
            headers=test_user["headers"],
        )

        resp = client.get(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_list_options_empty(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        route_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        route_id = route_resp.json()["id"]

        resp = client.get(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        assert resp.json() == []


class TestDeleteRouteOption:
    """DELETE /api/trips/{trip_id}/routes/{route_id}/options/{option_id}"""

    def test_delete_option(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        route_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        route_id = route_resp.json()["id"]

        option_resp = client.post(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            json={"mode": "bus"},
            headers=test_user["headers"],
        )
        option_id = option_resp.json()["id"]

        resp = client.delete(
            f"/api/trips/{trip.id}/routes/{route_id}/options/{option_id}",
            headers=test_user["headers"],
        )
        assert resp.status_code == 204

        # Verify it's gone
        list_resp = client.get(
            f"/api/trips/{trip.id}/routes/{route_id}/options",
            headers=test_user["headers"],
        )
        assert list_resp.json() == []

    def test_delete_option_not_found(self, client, test_user, test_trip_with_item, second_item):
        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        route_resp = _create_route(
            client,
            trip.id,
            test_trip_with_item["item"].id,
            second_item.id,
            day.id,
            test_user["headers"],
        )
        route_id = route_resp.json()["id"]

        resp = client.delete(
            f"/api/trips/{trip.id}/routes/{route_id}/options/99999",
            headers=test_user["headers"],
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestRoutesAuth:
    """Unauthenticated access should return 401."""

    def test_unauthenticated_list_routes(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp = client.get(f"/api/trips/{trip.id}/routes")
        assert resp.status_code == 401

    def test_unauthenticated_create_route(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp = client.post(
            f"/api/trips/{trip.id}/routes",
            json={"from_item_id": 1, "to_item_id": 2, "day_id": 1},
        )
        assert resp.status_code == 401

    def test_unauthenticated_list_options(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        resp = client.get(f"/api/trips/{trip.id}/routes/1/options")
        assert resp.status_code == 401
