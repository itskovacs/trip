"""Tests for RestaurantDetails and Dish CRUD router."""

import pytest


class TestCreateRestaurantDetails:
    """POST /api/places/{place_id}/restaurant"""

    def test_create_restaurant(self, client, test_user, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={
                "cuisine": "French",
                "price_range": "$$$",
                "reservation_required": True,
                "must_try": True,
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["cuisine"] == "French"
        assert data["price_range"] == "$$$"
        assert data["reservation_required"] is True
        assert data["must_try"] is True
        assert data["place_id"] == test_place.id

    def test_create_restaurant_minimal(self, client, test_user, test_place):
        """Creating with only optional fields should work."""
        response = client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "Italian"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["cuisine"] == "Italian"
        assert data["price_range"] is None
        assert data["reservation_required"] is False
        assert data["must_try"] is False

    def test_create_restaurant_duplicate(self, client, test_user, test_place):
        """Creating details when they already exist should return 409."""
        client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "French"},
            headers=test_user["headers"],
        )
        response = client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "Italian"},
            headers=test_user["headers"],
        )
        assert response.status_code == 409

    def test_create_restaurant_place_not_found(self, client, test_user):
        response = client.post(
            "/api/places/99999/restaurant",
            json={"cuisine": "French"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestGetRestaurantDetails:
    """GET /api/places/{place_id}/restaurant"""

    def test_get_restaurant(self, client, test_user, test_place):
        client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "Japanese", "price_range": "$$"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/places/{test_place.id}/restaurant",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["cuisine"] == "Japanese"
        assert data["price_range"] == "$$"
        assert data["place_id"] == test_place.id

    def test_get_restaurant_not_found(self, client, test_user, test_place):
        response = client.get(
            f"/api/places/{test_place.id}/restaurant",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestUpdateRestaurantDetails:
    """PUT /api/places/{place_id}/restaurant"""

    def test_update_restaurant(self, client, test_user, test_place):
        client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "French", "price_range": "$$"},
            headers=test_user["headers"],
        )
        response = client.put(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "Italian", "price_range": "$$$", "must_try": True},
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["cuisine"] == "Italian"
        assert data["price_range"] == "$$$"
        assert data["must_try"] is True

    def test_update_restaurant_not_found(self, client, test_user, test_place):
        response = client.put(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "Thai"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestDeleteRestaurantDetails:
    """DELETE /api/places/{place_id}/restaurant"""

    def test_delete_restaurant(self, client, test_user, test_place):
        client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "French"},
            headers=test_user["headers"],
        )
        response = client.delete(
            f"/api/places/{test_place.id}/restaurant",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        get_response = client.get(
            f"/api/places/{test_place.id}/restaurant",
            headers=test_user["headers"],
        )
        assert get_response.status_code == 404

    def test_delete_restaurant_not_found(self, client, test_user, test_place):
        response = client.delete(
            f"/api/places/{test_place.id}/restaurant",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestCreateDish:
    """POST /api/places/{place_id}/restaurant/dishes"""

    def test_add_dish(self, client, test_user, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/restaurant/dishes",
            json={
                "name": "Coq au Vin",
                "price": 28.50,
                "description": "Classic French braised chicken",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Coq au Vin"
        assert data["price"] == 28.50
        assert data["description"] == "Classic French braised chicken"
        assert data["place_id"] == test_place.id

    def test_add_dish_minimal(self, client, test_user, test_place):
        """Only name is required."""
        response = client.post(
            f"/api/places/{test_place.id}/restaurant/dishes",
            json={"name": "Bread"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Bread"
        assert data["price"] is None
        assert data["description"] is None

    def test_add_dish_place_not_found(self, client, test_user):
        response = client.post(
            "/api/places/99999/restaurant/dishes",
            json={"name": "Ghost Dish"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestListDishes:
    """GET /api/places/{place_id}/restaurant/dishes"""

    def test_list_dishes(self, client, test_user, test_place):
        client.post(
            f"/api/places/{test_place.id}/restaurant/dishes",
            json={"name": "Dish A", "price": 10.0},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/places/{test_place.id}/restaurant/dishes",
            json={"name": "Dish B", "price": 15.0},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/places/{test_place.id}/restaurant/dishes",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        names = {d["name"] for d in data}
        assert names == {"Dish A", "Dish B"}

    def test_list_dishes_empty(self, client, test_user, test_place):
        response = client.get(
            f"/api/places/{test_place.id}/restaurant/dishes",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.json() == []


class TestDeleteDish:
    """DELETE /api/places/{place_id}/restaurant/dishes/{dish_id}"""

    def test_delete_dish(self, client, test_user, test_place):
        create_resp = client.post(
            f"/api/places/{test_place.id}/restaurant/dishes",
            json={"name": "To Delete"},
            headers=test_user["headers"],
        )
        dish_id = create_resp.json()["id"]

        response = client.delete(
            f"/api/places/{test_place.id}/restaurant/dishes/{dish_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        list_resp = client.get(
            f"/api/places/{test_place.id}/restaurant/dishes",
            headers=test_user["headers"],
        )
        assert len(list_resp.json()) == 0

    def test_delete_dish_not_found(self, client, test_user, test_place):
        response = client.delete(
            f"/api/places/{test_place.id}/restaurant/dishes/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestRestaurantAuth:
    """Authentication tests."""

    def test_unauthenticated_get_restaurant(self, client, test_place):
        response = client.get(f"/api/places/{test_place.id}/restaurant")
        assert response.status_code == 401

    def test_unauthenticated_post_restaurant(self, client, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/restaurant",
            json={"cuisine": "No auth"},
        )
        assert response.status_code == 401

    def test_unauthenticated_get_dishes(self, client, test_place):
        response = client.get(f"/api/places/{test_place.id}/restaurant/dishes")
        assert response.status_code == 401

    def test_unauthenticated_post_dish(self, client, test_place):
        response = client.post(
            f"/api/places/{test_place.id}/restaurant/dishes",
            json={"name": "No auth dish"},
        )
        assert response.status_code == 401
