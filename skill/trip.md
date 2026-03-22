---
name: trip
description: Manage trips, places, and itinerary items in the TravelThing trip planner via its REST API. Supports creating trips, adding days and items, managing places with enriched details, and building full itineraries conversationally.
---

# TravelThing Trip Management Skill

## API Configuration

- **Backend URL**: `http://localhost:8000`
- **Auth type**: JWT Bearer token
- **Content-Type**: `application/json`

All authenticated endpoints require the header:
```
Authorization: Bearer <access_token>
```

## Credentials

Store credentials in a `.env` file at the project root. Never hard-code them.

```env
TRIP_USERNAME=your_username
TRIP_PASSWORD=your_password
TRIP_API_URL=http://localhost:8000
```

Load credentials from `.env` before making API calls. If `.env` is missing, ask the user for their username and password.

## Authentication Flow

**Login** -- obtain a JWT access token and refresh token:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "<username>", "password": "<password>"}'
```

Response:
```json
{"access_token": "eyJ...", "refresh_token": "eyJ..."}
```

**Refresh** -- get a new access token when the current one expires:

```bash
curl -X POST http://localhost:8000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

Always authenticate first, then use the `access_token` as a Bearer token on all subsequent requests.

---

## API Endpoints

### Categories

Categories group places (e.g. "Restaurant", "Museum", "Park"). A `category_id` is required when creating a Place.

| Method | Endpoint                    | Description             |
|--------|-----------------------------|-------------------------|
| GET    | `/api/categories`           | List all categories     |
| POST   | `/api/categories`           | Create a category       |
| PUT    | `/api/categories/{id}`      | Update a category       |
| DELETE | `/api/categories/{id}`      | Delete a category       |

**Create category body:**
```json
{"name": "Restaurant", "color": "#e74c3c"}
```

### Places

Places are reusable locations that can be linked to multiple trips.

| Method | Endpoint               | Description          |
|--------|------------------------|----------------------|
| GET    | `/api/places`          | List all places      |
| POST   | `/api/places`          | Create a place       |
| GET    | `/api/places/{id}`     | Get a single place   |
| PUT    | `/api/places/{id}`     | Update a place       |
| DELETE | `/api/places/{id}`     | Delete a place       |

**Create place body:**
```json
{
  "name": "Eiffel Tower",
  "lat": 48.8584,
  "lng": 2.2945,
  "place": "Paris, France",
  "category_id": 1,
  "description": "Iconic iron lattice tower",
  "price": 26.10,
  "duration": 120,
  "visited": false,
  "allowdog": false,
  "restroom": true
}
```

### PlaceDetails (TravelThing Extension)

One-to-one extension storing enriched metadata for a place (hours, rating, tips, contact info).

| Method | Endpoint                       | Description              |
|--------|--------------------------------|--------------------------|
| POST   | `/api/places/{id}/details`     | Create place details     |
| GET    | `/api/places/{id}/details`     | Get place details        |
| PUT    | `/api/places/{id}/details`     | Update place details     |
| DELETE | `/api/places/{id}/details`     | Delete place details     |

**Create place details body:**
```json
{
  "opening_hours": {
    "monday": "09:00-18:00",
    "tuesday": "09:00-18:00",
    "wednesday": "09:00-18:00",
    "thursday": "09:00-21:00",
    "friday": "09:00-18:00",
    "saturday": "09:00-18:00",
    "sunday": "09:00-18:00"
  },
  "rating": 4.7,
  "tips": "Visit early morning to avoid crowds. The summit has the best views but longest queues.",
  "subcategory": "landmark",
  "address": "Champ de Mars, 5 Av. Anatole France, 75007 Paris",
  "contact_phone": "+33 892 70 12 39",
  "contact_website": "https://www.toureiffel.paris",
  "links": ["https://en.wikipedia.org/wiki/Eiffel_Tower"]
}
```

### Trips

| Method | Endpoint                | Description           |
|--------|-------------------------|-----------------------|
| GET    | `/api/trips`            | List all trips        |
| POST   | `/api/trips`            | Create a trip         |
| GET    | `/api/trips/{id}`       | Get trip with days    |
| PUT    | `/api/trips/{id}`       | Update a trip         |
| DELETE | `/api/trips/{id}`       | Delete a trip         |

**Create trip body:**
```json
{"name": "Paris Weekend", "currency": "EUR"}
```

**Update trip body** (link places to the trip via `place_ids`):
```json
{"place_ids": [1, 2, 3]}
```

### Trip Days

| Method | Endpoint                            | Description       |
|--------|-------------------------------------|-------------------|
| POST   | `/api/trips/{id}/days`              | Create a day      |
| PUT    | `/api/trips/{id}/days/{day_id}`     | Update a day      |
| DELETE | `/api/trips/{id}/days/{day_id}`     | Delete a day      |

**Create day body:**
```json
{"label": "Day 1", "dt": "2026-06-15"}
```

### Trip Items (Itinerary Entries)

Items are scheduled activities within a day.

| Method | Endpoint                                         | Description        |
|--------|--------------------------------------------------|--------------------|
| POST   | `/api/trips/{id}/days/{day_id}/items`            | Create an item     |
| PUT    | `/api/trips/{id}/days/{day_id}/items/{item_id}`  | Update an item     |
| DELETE | `/api/trips/{id}/days/{day_id}/items/{item_id}`  | Delete an item     |

**Create item body:**
```json
{
  "time": "09:00",
  "text": "Visit Eiffel Tower",
  "comment": "Pre-booked tickets for summit access",
  "place": 1,
  "status": "booked",
  "price": 26.10
}
```

Status values: `"pending"`, `"booked"`, `"constraint"`, `"optional"`.

Time format: `"HH:MM"` (24-hour), e.g. `"09:00"`, `"14:30"`.

### TripItemDetails (TravelThing Extension)

One-to-one extension storing booking/priority metadata for a trip item.

| Method | Endpoint                                          | Description               |
|--------|---------------------------------------------------|---------------------------|
| POST   | `/api/trips/{id}/items/{item_id}/details`         | Create item details       |
| GET    | `/api/trips/{id}/items/{item_id}/details`         | Get item details          |
| PUT    | `/api/trips/{id}/items/{item_id}/details`         | Update item details       |
| DELETE | `/api/trips/{id}/items/{item_id}/details`         | Delete item details       |

**Create item details body:**
```json
{
  "confirmation_code": "BOOK-12345",
  "priority": "must-see",
  "duration_minutes": 120,
  "alternative_item_id": null,
  "alternative_reason": null
}
```

Priority values: `"must-see"`, `"should-see"`, `"nice-to-have"`.

---

## Data Enrichment Flow

When a user asks to add a place, follow this enrichment workflow:

### Step 1: Research the place

Use **WebSearch** to find:
- Exact coordinates (latitude, longitude)
- Address
- Opening hours
- Entrance fees / pricing
- Average rating
- Visitor tips and recommendations
- Contact information (phone, website)
- For restaurants: cuisine type, recommended dishes, reservation info

### Step 2: Create the Place

```
POST /api/places
```

Include the core fields: `name`, `lat`, `lng`, `place` (city/region), `category_id`, `description`, `price`, `duration` (estimated visit time in minutes).

You must know the correct `category_id`. Fetch categories first with `GET /api/categories` if needed. If no matching category exists, create one.

### Step 3: Create PlaceDetails

```
POST /api/places/{place_id}/details
```

Populate `opening_hours`, `rating`, `tips`, `subcategory`, `address`, `contact_phone`, `contact_website`, and `links` from the research in Step 1.

### Step 4: Link Place to Trip

```
PUT /api/trips/{trip_id}
```

Send `{"place_ids": [<existing_ids>, <new_place_id>]}` to add the place to the trip. Fetch the trip first to get the current `place_ids` so you don't remove existing ones.

### Step 5: (Optional) Add as itinerary item

If the user specifies a day and time:
```
POST /api/trips/{trip_id}/days/{day_id}/items
```

With `"place": <place_id>` to link it.

---

## Example Usage Patterns

### "Create a trip to Tokyo for next week"

1. Authenticate (login)
2. `POST /api/trips` with `{"name": "Tokyo Trip", "currency": "JPY"}`
3. Create days: `POST /api/trips/{id}/days` for each day with label and date

### "Add Senso-ji Temple to my Tokyo trip"

1. WebSearch for "Senso-ji Temple Tokyo hours fees coordinates"
2. `GET /api/categories` to find or create a suitable category (e.g. "Temple")
3. `POST /api/places` with name, coordinates, description, price, duration
4. `POST /api/places/{id}/details` with hours, rating, tips, address, website
5. `GET /api/trips/{id}` to retrieve current place_ids
6. `PUT /api/trips/{id}` with updated `place_ids` list including the new place

### "Schedule a visit to Senso-ji at 10am on Day 2"

1. `GET /api/trips/{id}` to find the day_id for Day 2 and the place_id for Senso-ji
2. `POST /api/trips/{id}/days/{day_id}/items` with:
   ```json
   {"time": "10:00", "text": "Visit Senso-ji Temple", "place": <place_id>, "status": "pending"}
   ```
3. Optionally `POST /api/trips/{id}/items/{item_id}/details` with priority and duration

### "Find good ramen places near Shinjuku and add them"

1. WebSearch for "best ramen restaurants near Shinjuku Tokyo"
2. For each result:
   - Create the Place with coordinates, price range, description
   - Create PlaceDetails with hours, rating, cuisine info in `subcategory`, tips about recommended dishes
   - Link to the trip via `PUT /api/trips/{id}` with updated `place_ids`

### "What's on my itinerary for Day 1?"

1. `GET /api/trips/{id}` -- the response includes all days with their items
2. Find the day with the matching label or date and summarize its items

---

## Important Notes

- The API uses **SQLite** as the database, so it handles one writer at a time. Avoid concurrent writes.
- **Trip archival**: Archived trips cannot be modified (no adding days/items). Unarchive first by setting `"archived": false`.
- **Place-Trip linking**: Places must be linked to a trip via `place_ids` in `PUT /api/trips/{id}` before they can be referenced by trip items. If you create an item with a `place` id that is not in the trip's place list, the API will reject it.
- **Image fields** accept either a base64-encoded image string or an HTTP URL.
- All `DELETE` endpoints return `{}` (empty object) or HTTP 204 on success.
- The `time` field on items must be in 24-hour `"HH:MM"` format (e.g., `"09:00"`, `"23:30"`). Bare `"HH"` is also accepted and will be zero-padded.
