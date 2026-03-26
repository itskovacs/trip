"""Tests for Budget CRUD, summary aggregation, and exchange rates."""

import pytest


# ---------------------------------------------------------------------------
# Budget CRUD
# ---------------------------------------------------------------------------


class TestCreateBudget:
    """POST /api/trips/{trip_id}/budget"""

    def test_create_budget(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/budget",
            json={
                "category": "food",
                "planned_amount": 500.0,
                "currency": "EUR",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["category"] == "food"
        assert data["planned_amount"] == 500.0
        assert data["currency"] == "EUR"
        assert data["trip_id"] == trip.id
        assert "id" in data

    def test_create_budget_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "transport", "planned_amount": 100.0},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["category"] == "transport"
        assert data["planned_amount"] == 100.0
        assert data["currency"] is None

    def test_create_budget_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.post(
            "/api/trips/99999/budget",
            json={"category": "food", "planned_amount": 100.0},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestListBudget:
    """GET /api/trips/{trip_id}/budget"""

    def test_list_budget(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "food", "planned_amount": 500.0},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "transport", "planned_amount": 200.0},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/budget",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_budget_empty(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/budget",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.json() == []


class TestUpdateBudget:
    """PUT /api/trips/{trip_id}/budget/{id}"""

    def test_update_budget(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "food", "planned_amount": 500.0, "currency": "EUR"},
            headers=test_user["headers"],
        )
        budget_id = create_resp.json()["id"]
        response = client.put(
            f"/api/trips/{trip.id}/budget/{budget_id}",
            json={"planned_amount": 750.0, "currency": "USD"},
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["planned_amount"] == 750.0
        assert data["currency"] == "USD"
        # category should remain unchanged
        assert data["category"] == "food"

    def test_update_budget_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.put(
            f"/api/trips/{trip.id}/budget/99999",
            json={"planned_amount": 100.0},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestDeleteBudget:
    """DELETE /api/trips/{trip_id}/budget/{id}"""

    def test_delete_budget(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "food", "planned_amount": 500.0},
            headers=test_user["headers"],
        )
        budget_id = create_resp.json()["id"]
        response = client.delete(
            f"/api/trips/{trip.id}/budget/{budget_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        list_resp = client.get(
            f"/api/trips/{trip.id}/budget",
            headers=test_user["headers"],
        )
        assert list_resp.json() == []

    def test_delete_budget_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/budget/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Budget Summary (aggregation)
# ---------------------------------------------------------------------------


class TestBudgetSummary:
    """GET /api/trips/{trip_id}/budget/summary"""

    def test_summary_empty(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/budget/summary",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["planned_total"] == 0.0
        assert data["actual_total"] == 0.0
        assert data["breakdown_by_category"] == {}
        assert data["per_day"] == {}

    def test_summary_with_budget_entries(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "food", "planned_amount": 500.0},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "transport", "planned_amount": 200.0},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/budget/summary",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["planned_total"] == 700.0
        assert data["breakdown_by_category"]["food"] == 500.0
        assert data["breakdown_by_category"]["transport"] == 200.0

    def test_summary_actual_total_from_items(self, client, test_user, test_trip_with_item, db):
        """actual_total should be the sum of TripItem.price values across the trip."""
        from trip.models.models import TripItem

        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        item = test_trip_with_item["item"]

        # The fixture item has no price, so set one
        item.price = 25.0
        db.add(item)

        # Add a second item with a price
        item2 = TripItem(time="10:00", text="Lunch", day_id=day.id, price=15.50)
        db.add(item2)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/budget/summary",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["actual_total"] == 40.50

    def test_summary_per_day(self, client, test_user, test_trip_with_item, db):
        """per_day should map day labels to the sum of item prices in that day."""
        from trip.models.models import TripItem

        trip = test_trip_with_item["trip"]
        day = test_trip_with_item["day"]
        item = test_trip_with_item["item"]

        item.price = 20.0
        db.add(item)

        item2 = TripItem(time="12:00", text="Cafe", day_id=day.id, price=10.0)
        db.add(item2)
        db.commit()

        response = client.get(
            f"/api/trips/{trip.id}/budget/summary",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["per_day"]["Day 1"] == 30.0

    def test_summary_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.get(
            "/api/trips/99999/budget/summary",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Exchange Rates
# ---------------------------------------------------------------------------


class TestCreateExchangeRate:
    """POST /api/exchange-rates"""

    def test_create_exchange_rate(self, client, test_user):
        response = client.post(
            "/api/exchange-rates",
            json={
                "from_currency": "USD",
                "to_currency": "EUR",
                "rate": 0.92,
                "fetched_at": "2026-03-22T12:00:00",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["from_currency"] == "USD"
        assert data["to_currency"] == "EUR"
        assert data["rate"] == 0.92
        assert "id" in data

    def test_create_exchange_rate_minimal(self, client, test_user):
        response = client.post(
            "/api/exchange-rates",
            json={
                "from_currency": "GBP",
                "to_currency": "USD",
                "rate": 1.27,
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["from_currency"] == "GBP"
        assert data["fetched_at"] is None


class TestListExchangeRates:
    """GET /api/exchange-rates"""

    def test_list_exchange_rates(self, client, test_user):
        client.post(
            "/api/exchange-rates",
            json={"from_currency": "USD", "to_currency": "EUR", "rate": 0.92},
            headers=test_user["headers"],
        )
        client.post(
            "/api/exchange-rates",
            json={"from_currency": "GBP", "to_currency": "USD", "rate": 1.27},
            headers=test_user["headers"],
        )
        response = client.get(
            "/api/exchange-rates",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_exchange_rates_empty(self, client, test_user):
        response = client.get(
            "/api/exchange-rates",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.json() == []


# ---------------------------------------------------------------------------
# Auth – unauthenticated access
# ---------------------------------------------------------------------------


class TestBudgetAuth:
    """Unauthenticated access should return 401."""

    def test_unauthenticated_budget_list(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(f"/api/trips/{trip.id}/budget")
        assert response.status_code == 401

    def test_unauthenticated_budget_create(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/budget",
            json={"category": "food", "planned_amount": 100.0},
        )
        assert response.status_code == 401

    def test_unauthenticated_budget_summary(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(f"/api/trips/{trip.id}/budget/summary")
        assert response.status_code == 401

    def test_unauthenticated_exchange_rates(self, client):
        response = client.get("/api/exchange-rates")
        assert response.status_code == 401
