---
name: trip
description: Intelligent one-shot trip planning assistant. Say "plan a 3-day Istanbul trip for April 2026" and Claude will research, create, enrich, and organize the entire trip automatically — no separate commands needed.
---

# TravelThing — One-Shot Trip Planner

When a user asks to plan a trip (e.g. "plan a 3-day Istanbul trip for April 2026"), execute **all 16 steps below automatically** in a single pass. Do not ask the user to run separate commands — do everything in one shot.

---

## Critical Technical Rules

Read these FIRST. Violating any of these will cause API errors.

| Rule | Detail |
|------|--------|
| **Auth** | `POST /api/auth/login` with JSON `{"username":"...","password":"..."}` returns `access_token`. Use `Authorization: Bearer <token>` on every subsequent request. |
| **Base URL** | `http://localhost:8080` (Docker) or `http://localhost:8000` (local dev). Load from `.env` if available. |
| **Place field in items** | When creating items, the field is **`"place"`** — NOT `"place_id"`. |
| **Place linking before items** | You MUST `PUT /api/trips/{id}` with `{"place_ids": [...]}` BEFORE creating any items that reference those places. The API rejects items with unlinked places. |
| **Images** | Pass `"image": "https://..."` when creating places. The upstream server downloads and crops automatically. Use web search to find a real Wikipedia or tourism photo URL for each place. |
| **Packing categories** | Must be one of: `clothes`, `toiletries`, `tech`, `documents`, `other` |
| **Weather conditions** | `sunny`, `partly-cloudy`, `cloudy`, `rain`, `snow`, `storm` |
| **Priority values** | `must-see`, `should-see`, `nice-to-have` |
| **Time format** | `"HH:MM"` 24-hour (e.g. `"09:00"`, `"14:30"`) |
| **Status values** | `pending`, `booked`, `constraint`, `optional` |
| **Content-Type** | `application/json` on all requests |
| **SQLite** | One writer at a time — avoid concurrent writes |
| **Archived trips** | Cannot be modified. Unarchive first (`"archived": false`). |
| **DELETE responses** | Return `{}` or HTTP 204 |

### Credentials & User Management

Load from `.env` at the project root. If missing, ask the user for username and password.

```env
TRIP_USERNAME=your_username
TRIP_PASSWORD=your_password
TRIP_API_URL=http://localhost:8080
```

**First-time setup:**
1. If no user exists, register: `POST /api/auth/register` with `{"username":"...","password":"..."}`
2. Save credentials to `.env`
3. The first registered user automatically becomes admin

**Auth flow for each session:**
1. Read `.env` for credentials
2. `POST /api/auth/login` with JSON `{"username":"...","password":"..."}` → get `access_token`
3. Use `Authorization: Bearer <token>` on all subsequent requests
4. Tokens expire after ~30 minutes — if you get "Invalid Token", re-login

**Sharing trips with friends/family:**
- Trip owner creates a share link: `POST /api/trips/{id}/share` with `{"is_full_access": false}`
- Returns a `token` — share URL is `http://localhost:8080/shared/{token}`
- Friends open the URL in their browser — no account needed for view-only access
- For full access (editing), set `is_full_access: true` and they need an account

---

## The 16-Step One-Shot Flow

When a user says something like "plan a 3-day Istanbul trip for April 2026", execute every step below in sequence. Track all created IDs as you go.

### Step 1 — Research the destination

Use **WebSearch** to find:
- Top attractions, museums, landmarks (with coordinates, hours, fees)
- Best restaurants and local cuisine (with coordinates, cuisine type, signature dishes)
- Hidden gems and local favorites
- Typical weather for the travel dates
- Visa requirements, emergency numbers, local customs
- Real photo URLs (Wikipedia, tourism sites) for each place
- Average costs for food, transport, activities

Gather enough for a full, rich itinerary — aim for 4-6 stops per day mixing attractions and meals.

### Step 2 — Create the trip

```
POST /api/trips
{"name": "Istanbul Adventure", "currency": "TRY", "start_date": "2026-04-10", "end_date": "2026-04-12"}
```

Save the returned `trip_id`.

### Step 3 — Create days

For each day of the trip:

```
POST /api/trips/{trip_id}/days
{"label": "Day 1 — Old City", "dt": "2026-04-10"}
```

Save each returned `day_id`.

### Step 4 — Create places

For every attraction, restaurant, and point of interest:

```
POST /api/places
{
  "name": "Hagia Sophia",
  "lat": 41.0086,
  "lng": 28.9802,
  "place": "Istanbul, Turkey",
  "category_id": 1,
  "description": "Former cathedral and mosque, now a museum. One of the greatest architectural achievements in history.",
  "price": 25.00,
  "duration": 90,
  "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hagia_Sophia_Mars_2013.jpg/1280px-Hagia_Sophia_Mars_2013.jpg",
  "visited": false
}
```

Fetch categories first with `GET /api/categories`. If no matching category exists, create one with `POST /api/categories`.

**Getting real photos via Wikipedia API:**
For each place, fetch a real photo URL from Wikipedia before creating the place:

```bash
curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/ARTICLE_NAME" \
  -H "User-Agent: TravelThing/1.0"
```

This returns JSON with `originalimage.source` containing a direct image URL. Use that URL in the `"image"` field when creating the place — the upstream server will download and crop it automatically.

**Important for non-ASCII characters** (Portuguese, Turkish, etc.): URL-encode the article name. For example:
- `Jerónimos_Monastery` → `Jer%C3%B3nimos_Monastery`
- `São_Jorge_Castle` → `S%C3%A3o_Jorge_Castle`
- `Praça_do_Comércio` → `Pra%C3%A7a_do_Com%C3%A9rcio`

If the Wikipedia article doesn't exist or has no image, try a related article (e.g., "Trams_in_Lisbon" instead of "Tram_28").

Save all returned `place_id` values.

### Step 5 — Link places to the trip

**⚠️ CRITICAL: This must happen BEFORE creating items in Step 6. The API will reject items referencing unlinked places with a 400 error.**

**⚠️ NOTE: `place_ids` in trip CREATE (`POST /api/trips`) does NOT work reliably. Always use PUT to link places:**

```
PUT /api/trips/{trip_id}
{"place_ids": [1, 2, 3, 4, 5, 6, 7, 8, 9]}
```

Include ALL place IDs created in Step 4. This replaces the entire place list, so always include all IDs.

### Step 6 — Create itinerary items

For each day, create timed items. The field is **`"place"`** not `"place_id"`:

```
POST /api/trips/{trip_id}/days/{day_id}/items
{
  "time": "09:00",
  "text": "Visit Hagia Sophia",
  "comment": "Arrive early to beat the crowds. Dress modestly.",
  "place": 1,
  "status": "pending",
  "price": 25.00
}
```

Optionally add item details for priority and duration:

```
POST /api/trips/{trip_id}/items/{item_id}/details
{"priority": "must-see", "duration_minutes": 90}
```

Save all returned `item_id` values (needed for routes in Step 9).

### Step 7 — Enrich places with details

For every place created:

```
POST /api/places/{place_id}/details
{
  "opening_hours": {
    "monday": "09:00-17:00",
    "tuesday": "09:00-17:00",
    "wednesday": "09:00-17:00",
    "thursday": "09:00-17:00",
    "friday": "09:00-17:00",
    "saturday": "09:00-17:00",
    "sunday": "09:00-17:00"
  },
  "rating": 4.8,
  "tips": "Visit early morning. The upper gallery has the best mosaics.",
  "subcategory": "mosque",
  "address": "Sultan Ahmet, Ayasofya Meydani No:1, 34122 Fatih/Istanbul",
  "contact_phone": "+90 212 522 1750",
  "contact_website": "https://muze.gen.tr/muze-detay/ayasofya",
  "links": ["https://en.wikipedia.org/wiki/Hagia_Sophia"]
}
```

### Step 8 — Enrich restaurants

For every place that is a restaurant:

```
POST /api/places/{place_id}/restaurant
{
  "cuisine": "Turkish",
  "price_range": "$$",
  "reservation_required": false,
  "must_try": "Iskender kebab"
}
```

Then add signature dishes:

```
POST /api/places/{place_id}/restaurant/dishes
{"name": "Iskender Kebab", "description": "Sliced doner over pide bread with tomato sauce and yogurt", "price": 180.00}
```

### Step 9 — Add routes between stops

For each pair of consecutive items within a day, create a route. **Automate this**: loop through each day's items in time order and create routes for each pair (item[0]→item[1], item[1]→item[2], etc.):

```
POST /api/trips/{trip_id}/routes
{"from_item_id": 1, "to_item_id": 2, "day_id": <day_id>, "recommended_mode": "walk", "notes": "10 min walk through old town"}
```

Then add transport options. **Estimate walking time** at ~5 km/h and use web search to check if there's a tram/metro option:

```
POST /api/trips/{trip_id}/routes/{route_id}/options
{"mode": "walk", "duration_minutes": 15, "distance_km": 1.2, "cost": 0, "recommended": true}
```

Valid modes: `walk`, `tram`, `bus`, `taxi`, `metro`, `car`, `ferry`, `bike`.

**Tip**: If items are very close (< 0.5 km), just add a walking option. If far apart (> 2 km), also add a transit option.

### Step 10 — Set budget

Create budget entries for each spending category:

```
POST /api/trips/{trip_id}/budget
{"category": "food", "planned": 1500.00, "actual": 0.00, "currency": "TRY", "note": "3 meals/day + snacks"}
```

Typical categories: `food`, `transport`, `activities`, `accommodation`, `shopping`, `other`.

### Step 11 — Add weather forecasts

For each day, web search for expected weather and create:

```
POST /api/trips/{trip_id}/days/{day_id}/weather
{
  "condition": "partly-cloudy",
  "temp_high": 18,
  "temp_low": 10,
  "description": "Partly cloudy with mild temperatures. Light jacket recommended."
}
```

Valid conditions: `sunny`, `partly-cloudy`, `cloudy`, `rain`, `snow`, `storm`.

### Step 12 — Add travel info

Web search for visa requirements, emergency numbers, and practical tips:

```
POST /api/trips/{trip_id}/travel-info
{
  "visa": "Most nationalities get e-visa or visa on arrival. Check evisa.gov.tr",
  "emergency_phone": "112 (general), 155 (police), 110 (fire)",
  "insurance": "Travel insurance recommended. EU health card not valid.",
  "notes": "Tipping 10-15% at restaurants. Tap water not recommended for drinking. Istanbul Kart for public transport."
}
```

### Step 13 — Generate packing list

Create packing items across all five categories:

```
POST /api/trips/{trip_id}/packing
{"item": "Light jacket", "category": "clothes", "packed": false}
```

Categories MUST be one of: `clothes`, `toiletries`, `tech`, `documents`, `other`.

Generate a sensible list based on destination, weather, and activities (e.g. comfortable walking shoes, sunscreen, passport, power adapter, camera).

### Step 14 — Generate checklist

Create pre-trip checklist items:

```
POST /api/trips/{trip_id}/checklist
{"item": "Apply for e-visa", "checked": false}
```

Include items like: book flights, reserve accommodation, get travel insurance, download offline maps, notify bank, charge electronics, print confirmations.

### Step 15 — Get directions

Fetch Google Maps direction URLs for the user:

```
GET /api/trips/{trip_id}/directions
```

Share the returned Google Maps URLs with the user so they can navigate each day's route.

### Step 16 — Print summary

Present a formatted overview to the user covering:

- Trip name, dates, currency
- Day-by-day itinerary with times, places, and descriptions
- Restaurant highlights and must-try dishes
- Budget breakdown
- Weather forecast per day
- Packing list highlights
- Google Maps links for each day
- Any visa/travel info alerts

---

## Individual Refresh Commands

After a trip is created, users can update specific aspects:

### "Update weather for my trip"
Re-fetch weather via web search for all days. Delete existing weather (`DELETE /api/trips/{id}/days/{day_id}/weather`) then create new entries.

### "Add Topkapi Palace to day 2"
Full enrichment flow for a single place:
1. WebSearch for the place
2. `POST /api/places` with all fields including image
3. `POST /api/places/{id}/details` with hours, rating, tips
4. `GET /api/trips/{id}` to get current `place_ids`
5. `PUT /api/trips/{id}` with updated `place_ids` array
6. `POST /api/trips/{id}/days/{day_id}/items` with `"place": <id>`
7. Create routes to/from adjacent items

### "Optimize day 1"
```
POST /api/trips/{id}/days/{day_id}/optimize
```
Reorders items for the most efficient route.

### "Export calendar"
```
GET /api/trips/{id}/export/ical
```
Returns an iCal file the user can import into Google Calendar, Apple Calendar, etc.

### "Who owes what"
```
GET /api/trips/{id}/settlement
```
Returns cost-splitting breakdown among trip members.

### "Regenerate packing list"
1. `GET /api/trips/{id}/packing` to get existing items
2. `DELETE /api/trips/{id}/packing/{item_id}` for each item
3. Create fresh items via `POST /api/trips/{id}/packing`

---

## Complete API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login, returns `access_token` and `refresh_token` |
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/refresh` | Refresh an expired access token |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create a category (`{"name": "...", "color": "#..."}`) |
| PUT | `/api/categories/{id}` | Update a category |
| DELETE | `/api/categories/{id}` | Delete a category |

### Places
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/places` | List all places |
| POST | `/api/places` | Create a place |
| GET | `/api/places/{id}` | Get a single place |
| PUT | `/api/places/{id}` | Update a place |
| DELETE | `/api/places/{id}` | Delete a place |

### Place Details
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/places/{id}/details` | Create place details (hours, rating, tips, contact) |
| GET | `/api/places/{id}/details` | Get place details |
| PUT | `/api/places/{id}/details` | Update place details |
| DELETE | `/api/places/{id}/details` | Delete place details |

### Restaurants
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/places/{id}/restaurant` | Create restaurant details |
| GET | `/api/places/{id}/restaurant` | Get restaurant details |
| PUT | `/api/places/{id}/restaurant` | Update restaurant details |
| DELETE | `/api/places/{id}/restaurant` | Delete restaurant details |

### Dishes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/places/{id}/restaurant/dishes` | Add a dish |
| GET | `/api/places/{id}/restaurant/dishes` | List dishes |
| DELETE | `/api/places/{id}/restaurant/dishes/{dish_id}` | Delete a dish |

### Trips
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips` | List all trips |
| POST | `/api/trips` | Create a trip (`{"name": "...", "currency": "..."}`) |
| GET | `/api/trips/{id}` | Get trip with days, items, places |
| PUT | `/api/trips/{id}` | Update trip (use `{"place_ids": [...]}` to link places) |
| DELETE | `/api/trips/{id}` | Delete a trip |

### Days
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips/{id}/days` | List days |
| POST | `/api/trips/{id}/days` | Create a day (`{"label": "...", "dt": "YYYY-MM-DD"}`) |
| PUT | `/api/trips/{id}/days/{day_id}` | Update a day |
| DELETE | `/api/trips/{id}/days/{day_id}` | Delete a day |

### Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/days/{day_id}/items` | Create an item (`"place"` not `"place_id"`) |
| PUT | `/api/trips/{id}/days/{day_id}/items/{item_id}` | Update an item |
| DELETE | `/api/trips/{id}/days/{day_id}/items/{item_id}` | Delete an item |

### Item Details
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/items/{item_id}/details` | Create item details (priority, duration, booking) |
| GET | `/api/trips/{id}/items/{item_id}/details` | Get item details |
| PUT | `/api/trips/{id}/items/{item_id}/details` | Update item details |
| DELETE | `/api/trips/{id}/items/{item_id}/details` | Delete item details |

### Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/routes` | Create a route (`{"from_item_id": ..., "to_item_id": ...}`) |
| GET | `/api/trips/{id}/routes` | List routes |
| GET | `/api/trips/{id}/routes/{route_id}` | Get a route |
| DELETE | `/api/trips/{id}/routes/{route_id}` | Delete a route |

### Route Options
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/routes/{route_id}/options` | Add option (`{"mode": "walk", "duration": 15, ...}`) |
| GET | `/api/trips/{id}/routes/{route_id}/options` | List options |
| DELETE | `/api/trips/{id}/routes/{route_id}/options/{option_id}` | Delete option |

### Flights
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/flights` | Create a flight |
| GET | `/api/trips/{id}/flights` | List flights |
| GET | `/api/trips/{id}/flights/{flight_id}` | Get a flight |
| PUT | `/api/trips/{id}/flights/{flight_id}` | Update a flight |
| DELETE | `/api/trips/{id}/flights/{flight_id}` | Delete a flight |

### Accommodation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/accommodation` | Create accommodation |
| GET | `/api/trips/{id}/accommodation` | List accommodation |
| DELETE | `/api/trips/{id}/accommodation/{acc_id}` | Delete accommodation |

### Rental Cars
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/rental-cars` | Create a rental car |
| GET | `/api/trips/{id}/rental-cars` | List rental cars |
| DELETE | `/api/trips/{id}/rental-cars/{car_id}` | Delete a rental car |

### Budget
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/budget` | Create a budget entry |
| GET | `/api/trips/{id}/budget` | List budget entries |
| PUT | `/api/trips/{id}/budget/{budget_id}` | Update a budget entry |
| DELETE | `/api/trips/{id}/budget/{budget_id}` | Delete a budget entry |
| GET | `/api/trips/{id}/budget/summary` | Aggregated budget summary |

### Exchange Rates
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/exchange-rates` | Create/update exchange rate |
| GET | `/api/exchange-rates` | List exchange rates |

### Weather
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/days/{day_id}/weather` | Create weather forecast |
| GET | `/api/trips/{id}/days/{day_id}/weather` | Get weather forecast |
| PUT | `/api/trips/{id}/days/{day_id}/weather` | Update weather forecast |
| DELETE | `/api/trips/{id}/days/{day_id}/weather` | Delete weather forecast |

### Travel Info
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/travel-info` | Create travel info (visa, emergency, etc.) |
| GET | `/api/trips/{id}/travel-info` | Get travel info |
| PUT | `/api/trips/{id}/travel-info` | Update travel info |
| DELETE | `/api/trips/{id}/travel-info` | Delete travel info |

### Versions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/versions` | Create a version snapshot |
| GET | `/api/trips/{id}/versions` | List versions |
| GET | `/api/trips/{id}/versions/{version_id}` | Get a version |
| DELETE | `/api/trips/{id}/versions/{version_id}` | Delete a version |

### Directions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips/{id}/directions` | Google Maps URLs for all days |
| GET | `/api/trips/{id}/days/{day_id}/directions` | Google Maps URL for one day |

### Calendar Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips/{id}/export/ical` | Export trip as iCal file |

### Route Optimization
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/trips/{id}/days/{day_id}/optimize` | Optimize stop order for a day |

### Cost Settlement
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips/{id}/settlement` | Who owes what |

### Packing List
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips/{id}/packing` | List packing items |
| POST | `/api/trips/{id}/packing` | Create a packing item (`category`: clothes/toiletries/tech/documents/other) |
| PUT | `/api/trips/{id}/packing/{item_id}` | Update a packing item |
| DELETE | `/api/trips/{id}/packing/{item_id}` | Delete a packing item |

### Checklist
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trips/{id}/checklist` | List checklist items |
| POST | `/api/trips/{id}/checklist` | Create a checklist item |
| PUT | `/api/trips/{id}/checklist/{item_id}` | Update a checklist item |
| DELETE | `/api/trips/{id}/checklist/{item_id}` | Delete a checklist item |

---

## Upstream Sync

TravelThing is a fork of [itskovacs/trip](https://github.com/itskovacs/trip). The upstream remote is configured as `upstream`.

### Check for upstream updates
```bash
git fetch upstream
git log HEAD..upstream/main --oneline
```
If there are new commits, review them before merging.

### Merge upstream changes
```bash
git fetch upstream
git merge upstream/main
```
If conflicts occur, they will typically be in `backend/trip/main.py` (router registrations). Our extension files (routers, models, tests) rarely conflict since they are new files.

### After merging
1. Run tests: `cd backend && source venv/bin/activate && python -m pytest tests/ -v`
2. Rebuild Docker: `docker-compose build && docker-compose up -d`
3. Verify the app works

### Version tagging
Our releases are tagged separately from upstream:
- `v0.1.0-phase1` — Fork + first extensions
- `v0.2.0-phase2` — Restaurants, routes, reservations, budget
- `v0.3.0-phase3-4` — Weather, travel info, versions, directions
- `v1.0.0` — First stable release
