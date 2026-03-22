"""Tests for Reservations CRUD router (flights, accommodation, rental cars)."""

import pytest


# ---------------------------------------------------------------------------
# Flights
# ---------------------------------------------------------------------------


class TestCreateFlight:
    """POST /api/trips/{trip_id}/flights"""

    def test_create_flight(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/flights",
            json={
                "airline": "Delta",
                "flight_number": "DL123",
                "departure_airport": "JFK",
                "departure_datetime": "2026-06-01T08:00:00",
                "arrival_airport": "CDG",
                "arrival_datetime": "2026-06-01T20:00:00",
                "confirmation_code": "ABC123",
                "cost": 850.00,
                "currency": "USD",
                "seat_info": "12A",
                "notes": "Window seat",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["airline"] == "Delta"
        assert data["flight_number"] == "DL123"
        assert data["departure_airport"] == "JFK"
        assert data["arrival_airport"] == "CDG"
        assert data["confirmation_code"] == "ABC123"
        assert data["cost"] == 850.00
        assert data["seat_info"] == "12A"
        assert data["trip_id"] == trip.id
        assert "id" in data

    def test_create_flight_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/flights",
            json={"airline": "United"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["airline"] == "United"
        assert data["flight_number"] is None

    def test_create_flight_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.post(
            "/api/trips/99999/flights",
            json={"airline": "Delta"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestListFlights:
    """GET /api/trips/{trip_id}/flights"""

    def test_list_flights(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/flights",
            json={"airline": "Delta", "flight_number": "DL123"},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/trips/{trip.id}/flights",
            json={"airline": "United", "flight_number": "UA456"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/flights",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_flights_empty(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/flights",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.json() == []


class TestGetFlight:
    """GET /api/trips/{trip_id}/flights/{id}"""

    def test_get_flight(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/flights",
            json={"airline": "Delta", "flight_number": "DL123"},
            headers=test_user["headers"],
        )
        flight_id = create_resp.json()["id"]
        response = client.get(
            f"/api/trips/{trip.id}/flights/{flight_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["airline"] == "Delta"
        assert data["id"] == flight_id

    def test_get_flight_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/flights/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestUpdateFlight:
    """PUT /api/trips/{trip_id}/flights/{id}"""

    def test_update_flight(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/flights",
            json={"airline": "Delta", "seat_info": "12A"},
            headers=test_user["headers"],
        )
        flight_id = create_resp.json()["id"]
        response = client.put(
            f"/api/trips/{trip.id}/flights/{flight_id}",
            json={"airline": "United", "seat_info": "14C", "cost": 999.99},
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["airline"] == "United"
        assert data["seat_info"] == "14C"
        assert data["cost"] == 999.99

    def test_update_flight_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.put(
            f"/api/trips/{trip.id}/flights/99999",
            json={"airline": "Delta"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestDeleteFlight:
    """DELETE /api/trips/{trip_id}/flights/{id}"""

    def test_delete_flight(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/flights",
            json={"airline": "Delta"},
            headers=test_user["headers"],
        )
        flight_id = create_resp.json()["id"]
        response = client.delete(
            f"/api/trips/{trip.id}/flights/{flight_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        get_resp = client.get(
            f"/api/trips/{trip.id}/flights/{flight_id}",
            headers=test_user["headers"],
        )
        assert get_resp.status_code == 404

    def test_delete_flight_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/flights/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Accommodation
# ---------------------------------------------------------------------------


class TestCreateAccommodation:
    """POST /api/trips/{trip_id}/accommodation"""

    def test_create_accommodation(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/accommodation",
            json={
                "name": "Hotel Paris",
                "address": "123 Rue de Rivoli",
                "lat": 48.8606,
                "lng": 2.3376,
                "check_in": "2026-06-01",
                "check_out": "2026-06-05",
                "confirmation_code": "HTL456",
                "cost_per_night": 150.00,
                "currency": "EUR",
                "amenities": ["wifi", "breakfast"],
                "phone": "+33-1-2345-6789",
                "website": "https://hotelparis.example.com",
                "notes": "Near Louvre",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Hotel Paris"
        assert data["address"] == "123 Rue de Rivoli"
        assert data["confirmation_code"] == "HTL456"
        assert data["cost_per_night"] == 150.00
        assert data["amenities"] == ["wifi", "breakfast"]
        assert data["trip_id"] == trip.id
        assert "id" in data

    def test_create_accommodation_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/accommodation",
            json={"name": "Hostel"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Hostel"
        assert data["address"] is None

    def test_create_accommodation_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.post(
            "/api/trips/99999/accommodation",
            json={"name": "Hotel"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestListAccommodation:
    """GET /api/trips/{trip_id}/accommodation"""

    def test_list_accommodation(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/accommodation",
            json={"name": "Hotel A"},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/trips/{trip.id}/accommodation",
            json={"name": "Hotel B"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/accommodation",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_accommodation_empty(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/accommodation",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.json() == []


class TestDeleteAccommodation:
    """DELETE /api/trips/{trip_id}/accommodation/{id}"""

    def test_delete_accommodation(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/accommodation",
            json={"name": "Hotel Paris"},
            headers=test_user["headers"],
        )
        acc_id = create_resp.json()["id"]
        response = client.delete(
            f"/api/trips/{trip.id}/accommodation/{acc_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        list_resp = client.get(
            f"/api/trips/{trip.id}/accommodation",
            headers=test_user["headers"],
        )
        assert list_resp.json() == []

    def test_delete_accommodation_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/accommodation/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Rental Cars
# ---------------------------------------------------------------------------


class TestCreateRentalCar:
    """POST /api/trips/{trip_id}/rental-cars"""

    def test_create_rental_car(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/rental-cars",
            json={
                "company": "Hertz",
                "pickup_location": "CDG Airport",
                "pickup_datetime": "2026-06-01T10:00:00",
                "dropoff_location": "CDG Airport",
                "dropoff_datetime": "2026-06-05T10:00:00",
                "confirmation_code": "RC789",
                "cost_per_day": 45.00,
                "currency": "EUR",
                "vehicle_type": "Compact",
                "notes": "GPS included",
            },
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["company"] == "Hertz"
        assert data["pickup_location"] == "CDG Airport"
        assert data["confirmation_code"] == "RC789"
        assert data["cost_per_day"] == 45.00
        assert data["vehicle_type"] == "Compact"
        assert data["trip_id"] == trip.id
        assert "id" in data

    def test_create_rental_car_minimal(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.post(
            f"/api/trips/{trip.id}/rental-cars",
            json={"company": "Avis"},
            headers=test_user["headers"],
        )
        assert response.status_code == 201
        data = response.json()
        assert data["company"] == "Avis"
        assert data["vehicle_type"] is None

    def test_create_rental_car_trip_not_found(self, client, test_user, test_trip_with_item):
        response = client.post(
            "/api/trips/99999/rental-cars",
            json={"company": "Hertz"},
            headers=test_user["headers"],
        )
        assert response.status_code == 404


class TestListRentalCars:
    """GET /api/trips/{trip_id}/rental-cars"""

    def test_list_rental_cars(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        client.post(
            f"/api/trips/{trip.id}/rental-cars",
            json={"company": "Hertz"},
            headers=test_user["headers"],
        )
        client.post(
            f"/api/trips/{trip.id}/rental-cars",
            json={"company": "Avis"},
            headers=test_user["headers"],
        )
        response = client.get(
            f"/api/trips/{trip.id}/rental-cars",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_rental_cars_empty(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(
            f"/api/trips/{trip.id}/rental-cars",
            headers=test_user["headers"],
        )
        assert response.status_code == 200
        assert response.json() == []


class TestDeleteRentalCar:
    """DELETE /api/trips/{trip_id}/rental-cars/{id}"""

    def test_delete_rental_car(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        create_resp = client.post(
            f"/api/trips/{trip.id}/rental-cars",
            json={"company": "Hertz"},
            headers=test_user["headers"],
        )
        car_id = create_resp.json()["id"]
        response = client.delete(
            f"/api/trips/{trip.id}/rental-cars/{car_id}",
            headers=test_user["headers"],
        )
        assert response.status_code == 204

        # Verify it's gone
        list_resp = client.get(
            f"/api/trips/{trip.id}/rental-cars",
            headers=test_user["headers"],
        )
        assert list_resp.json() == []

    def test_delete_rental_car_not_found(self, client, test_user, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.delete(
            f"/api/trips/{trip.id}/rental-cars/99999",
            headers=test_user["headers"],
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestReservationsAuth:
    """Unauthenticated access should return 401."""

    def test_unauthenticated_flights(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(f"/api/trips/{trip.id}/flights")
        assert response.status_code == 401

    def test_unauthenticated_accommodation(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(f"/api/trips/{trip.id}/accommodation")
        assert response.status_code == 401

    def test_unauthenticated_rental_cars(self, client, test_trip_with_item):
        trip = test_trip_with_item["trip"]
        response = client.get(f"/api/trips/{trip.id}/rental-cars")
        assert response.status_code == 401
