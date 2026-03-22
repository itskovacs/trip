# TravelThing — Design Specification (v2)

## Context

TravelThing is a collaborative trip planning app for friends and family. We fork [itskovacs/trip](https://github.com/itskovacs/trip) (1.3k stars, actively maintained, Angular + FastAPI + SQLite + Leaflet) and extend it with rich trip planning features inspired by Wanderlog, plus a Claude Code skill for conversational trip management and version control.

**Why fork trip?** It already provides a polished, minimalist UI with day-by-day itinerary, map visualization, item management, cost tracking, trip sharing, admin dashboard, packing/checklist lists, PWA support, and Docker deployment. We avoid rebuilding what works and focus on the genuine gaps.

**Target users:** The user + friends/family. User plans trips; others view and comment.

---

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Claude Code Skill  │────▶│  FastAPI Backend     │◀────│  Angular Frontend│
│  (/trip)            │     │  (extended)          │     │  (extended)      │
│                     │     │                      │     │                  │
│ • Create/edit trips │     │ • SQLite database    │     │ • Map view       │
│ • Web search data   │     │ • REST API           │     │ • Timeline view  │
│ • Enrich items      │     │ • Version snapshots  │     │ • Budget charts  │
│ • Upstream sync     │     │ • New routers        │     │ • Restaurant cards│
│ • Version mgmt     │     │                      │     │ • PDF export     │
└─────────────────────┘     └─────────────────────┘     └──────────────────┘
```

**Stack (inherited from trip):**
- Frontend: Angular (with Signals) + Tailwind CSS + SCSS
- Backend: Python 3.12 + FastAPI + SQLAlchemy
- Database: SQLite (`storage/trip.sqlite`)
- Migrations: Alembic (already set up upstream)
- Maps: Leaflet + OpenStreetMap / Google Maps (provider-agnostic)
- PWA: Angular service worker + manifest (already set up upstream)
- Deployment: Docker + docker-compose

---

## Upstream Data Model (existing entities)

Understanding these is critical — all our extensions build on top of them.

| Entity | Table | Key Fields | Notes |
|--------|-------|------------|-------|
| `User` | `user` | username (PK), currency, map_provider, api_token | Has dark mode, map prefs |
| `Place` | `place` | name, lat, lng, price, duration, description, category_id, visited, favorite | Reusable POI — shared across trips |
| `Category` | `category` | name, color, image_id | Groups Places |
| `Trip` | `trip` | name, currency, notes, image_id | Has shares, members, days |
| `TripDay` | `tripday` | label, dt (date), notes, trip_id | Belongs to a Trip |
| `TripItem` | `tripitem` | time, text, comment, lat, lng, price, status, place_id, day_id, paid_by | Scheduled instance within a day |
| `TripMember` | `tripmember` | user, trip_id, invited_by | Multi-user support with paid_by tracking |
| `TripShare` | `tripshare` | token, is_full_access, trip_id | Share links (full/partial) |
| `TripPackingListItem` | `trippackinglistitem` | text, qt, category (CLOTHES/TOILETRIES/TECH/DOCUMENTS/OTHER), packed | Already exists! |
| `TripChecklistItem` | `tripchecklistitem` | text, checked | Already exists! |
| `TripAttachment` | `tripattachment` | filename, file_size, uploaded_by, trip_id | File attachments |
| `TripPlaceLink` | `tripplacelink` | trip_id (FK), place_id (FK) | Junction: links Places to Trips |
| `TripItemAttachmentLink` | `tripitemattachmentlink` | item_id (FK), attachment_id (FK) | Junction: links Items to Attachments |
| `Image` | `image` | filename, file_size, user | Central image entity, FK'd from places/trips/items |
| `TripItemStatusEnum` | — | PENDING, CONFIRMED, CONSTRAINT, OPTIONAL | Item booking status |

**Key distinctions:**
- `Place` is a reusable POI, **scoped to a single user** (not globally shared). A Place can be linked to multiple trips via `TripPlaceLink`.
- `TripItem` is a scheduled instance of visiting a Place on a specific day/time.
- Extensions to metadata (cuisine, dishes, opening hours) go on `Place`. Extensions to scheduling (confirmation codes, priority) go on `TripItem`.
- `TripDay.dt` is **nullable** — a TripDay with `dt=null` can serve as an "Unscheduled" container.
- Both `Place` and `TripItem` have an `image_id` FK to the `Image` entity for uploaded photos. Our `place_details.photos` field stores external photo URLs (from web search), coexisting with the uploaded image system.

---

## Gap Analysis: What trip has vs. what we add

### Already in trip (no new work needed)
- Day-by-day itinerary with timeline sidebar (`TripDay` + `TripItem`)
- Interactive Leaflet map with POI markers (circular photo thumbnails)
- Item management (name, time, cost, coordinates, status: pending/confirmed/optional)
- Daily cost totals + per-item costs with `paid_by` tracking
- Trip sharing (partial/full via `TripShare`)
- Multi-user membership (`TripMember`)
- Packing lists with categories (`TripPackingListItem`)
- Checklists (`TripChecklistItem`)
- File attachments (`TripAttachment`)
- Admin dashboard, user management, magic links
- OpenStreetMap + Google Maps Routes API (provider-agnostic)
- PWA with service worker + manifest (`ngsw-config.json`)
- Docker deployment + server backups
- Alembic database migrations
- Dark mode, low-network mode
- Categories with colors for Places

### Extensions we build

#### 1. Rich Place Details
**Current:** `Place` has name, lat/lng, price, duration, description, category.
**Extension:** Extend `Place` with richer metadata via a new `place_details` table (1:1 FK to `place.id`):
- `opening_hours`: JSON field — array of `{ day: "mon"|...|"sun", open: "HH:MM", close: "HH:MM" }` plus `closed_dates: string[]` and `last_entry: "HH:MM"`
- `rating`: Float (1.0-5.0)
- `photos`: JSON array of URL strings (beyond the single image_id)
- `tips`: Text — free-form tips/notes
- `links`: JSON array of URL strings
- `subcategory`: String (museum, park, cafe, etc.)
- `contact_phone`, `contact_website`, `contact_email`: Strings
- `address`: String

**Why a separate table:** Keeps the core `Place` model untouched, minimizing merge conflicts with upstream.

**DB changes:** New `place_details` table via Alembic migration.
**API changes:** New router `backend/trip/routers/place_details.py` with CRUD endpoints.
**UI changes:** Expand the TripItem detail popup (bottom panel) with tabs: "Schedule" (existing day/time), "Place Details" (new rich info), "Photos", "Tips".

#### 2. Rich TripItem Details
**Current:** `TripItem` has time, text, comment, price, status, lat/lng.
**Extension:** Extend `TripItem` with scheduling metadata via a new `tripitem_details` table (1:1 FK to `tripitem.id`):
- `confirmation_code`: String — booking reference
- `priority`: Enum (must-see, should-see, nice-to-have)
- `duration_minutes`: Integer — expected time at this item
- `alternative_item_id`: Integer FK to another `tripitem.id` — backup plan
- `alternative_reason`: String (rainy day, too crowded, closed)

**DB changes:** New `tripitem_details` table via Alembic migration.
**API changes:** Extend existing `trips.py` router or new `backend/trip/routers/item_details.py`.
**UI changes:** Priority badges on items in timeline. "Plan B" indicator on items with alternatives.

#### 3. Restaurant & Food Features
**New entity extending `Place` for food-related POIs:**
- `cuisine`: String (Turkish, Italian, Japanese, etc.)
- `price_range`: Enum ($, $$, $$$, $$$$)
- `reservation_required`: Boolean
- `must_try`: Boolean highlight flag

**Recommended dishes** stored in a separate `dish` table:
- `place_id`: FK to `place.id`
- `name`: String
- `price`: Float
- `description`: String

**DB changes:** New `restaurant_details` table (1:1 FK to `place.id`), new `dish` table (many-to-one to `place.id`). Both via Alembic.
**API changes:** New router `backend/trip/routers/restaurants.py`.
**UI changes:** Restaurant card component in the item detail panel showing cuisine, price range, recommended dishes with prices. Dedicated "Restaurants" filter/view on the trip map.

#### 4. Transport Between Items
**New entity linking consecutive `TripItem`s within a day:**
- `from_item_id`: FK to `tripitem.id`
- `to_item_id`: FK to `tripitem.id`
- `day_id`: FK to `tripday.id`

**Transport options** stored in a child table `route_option`:
- `route_id`: FK to parent route
- `mode`: Enum (walk, tram, bus, taxi, metro, car, ferry, bike)
- `duration_minutes`: Integer
- `distance_km`: Float
- `cost`: Float
- `line_name`: String (e.g., "T1 Tram", "M2 Metro")
- `notes`: String
- `recommended`: Boolean

**Consecutive** is determined by sorting `TripItem`s by their `time` field within a `TripDay`. Items without `time` or without coordinates are skipped for route calculation.

**DB changes:** New `item_route` and `route_option` tables via Alembic.
**API changes:** New router `backend/trip/routers/item_routes.py`.
**UI changes:** Small connector card between items in the timeline showing mode icon, duration, distance. Route lines drawn on the map between consecutive items of the same day.

#### 5. Reservations Section
**New entities for trip-level bookings (not tied to a specific day/item):**

**`trip_flight` table:**
- trip_id (FK), airline, flight_number, departure_airport, departure_datetime, arrival_airport, arrival_datetime, confirmation_code, cost, currency, seat_info, notes

**`trip_accommodation` table:**
- trip_id (FK), name, address, lat, lng, check_in (datetime), check_out (datetime), confirmation_code, cost_per_night, currency, amenities (JSON array), phone, website, notes

**`trip_rental_car` table:**
- trip_id (FK), company, pickup_location, pickup_datetime, dropoff_location, dropoff_datetime, confirmation_code, cost_per_day, currency, vehicle_type, notes

**DB changes:** Three new tables via Alembic.
**API changes:** New router `backend/trip/routers/reservations.py` with CRUD for each reservation type.
**UI changes:** New "Reservations" tab/section in trip view showing all bookings as cards with confirmation codes, dates, costs. Flight entries also appear as special items on their departure/arrival days in the timeline.

#### 6. Budget Dashboard
**Visualization of all costs, integrating with the existing `paid_by` and balance system:**
- Pie/bar chart: breakdown by category (flights, accommodation, food, attractions, transport, shopping, misc)
- Per-member balance (extends existing `/api/trips/{trip_id}/balance` endpoint)
- Per-day cost breakdown
- Planned budget vs. actual comparison (progress bar)
- Currency conversion toggle

**Relationship to existing balance:** The upstream already calculates per-member balances via the `paid_by` field. Our budget dashboard wraps this with visual charts and adds planned budget tracking.

**DB changes:** New `trip_budget` table (trip_id FK, category, planned_amount, currency). New `exchange_rate` table (from_currency, to_currency, rate, fetched_at).
**API changes:** New router `backend/trip/routers/budget.py` — aggregation endpoints.
**UI changes:** New "Budget" view accessible from the trip toolbar (chart icon). Uses ngx-charts or Chart.js for Angular.

#### 7. Weather Forecast
**Per-day weather info stored on `TripDay`:**
- `high_temp`: Float
- `low_temp`: Float
- `condition`: Enum (sunny, partly-cloudy, cloudy, rain, snow, storm)
- `rain_chance`: Integer (0-100)
- Populated by Claude Code skill via web search
- Refreshable as trip date approaches

**DB changes:** New `day_weather` table (1:1 FK to `tripday.id`) via Alembic.
**API changes:** New router `backend/trip/routers/weather.py`.
**UI changes:** Weather badge on each day header in timeline (condition icon + temp range). Subtle background color hint (warm=amber, cold=blue, rain=gray).

#### 8. Currency Conversion
**Multi-currency support extending existing currency fields:**
- `Trip` and `User` already have a `currency` field
- `TripItem` has `price` but no currency — defaults to trip currency
- New: `exchange_rate` table (shared with Budget Dashboard)
- Claude Code skill populates exchange rates when creating/updating trips
- UI toggle to show all costs in trip's default currency or original

**DB changes:** Reuse `exchange_rate` table from Feature 6.
**API changes:** Add conversion utility endpoints to `budget.py` router.
**UI changes:** Currency toggle button in trip header and budget view.

#### 9. Travel Requirements
**Trip-level metadata for travel logistics:**

**`trip_travel_info` table:**
- trip_id (FK), visa_required (bool), visa_notes (text), vaccinations (JSON array), insurance_required (bool), insurance_notes (text), embassy_name, embassy_phone, embassy_address, local_emergency_number, insurance_provider, insurance_policy_number, insurance_phone, timezone (string), general_notes (text)

**DB changes:** New `trip_travel_info` table via Alembic.
**API changes:** New router `backend/trip/routers/travel_info.py`.
**UI changes:** "Info" tab in trip view showing travel requirements as structured info cards.

#### 10. Unscheduled / Flexible Items
**TripItems not assigned to a specific day.**

The upstream `TripDay.dt` field is already nullable. We create a `TripDay` with `dt=null` and `label="Unscheduled"` per trip to act as a container for flexible items.

**DB changes:** None — use existing schema. Each trip gets one "Unscheduled" TripDay created automatically.
**UI changes:** "Unscheduled" section below daily plans in the timeline sidebar. Drag-and-drop from unscheduled to a specific day.

#### 11. PDF Export
**Printable itinerary for offline/paper reference:**
- Day-by-day view with times, items, costs, transport
- Reservation details with confirmation codes
- Packing list (from existing `TripPackingListItem`)
- Emergency info (from `trip_travel_info`)
- Generated client-side in Angular

**UI changes:** "Export PDF" button in trip toolbar. Uses jsPDF + html2canvas or @angular/cdk for PDF generation.

---

## Consolidated New Schema

All new tables, showing relationships to existing upstream tables:

```
EXISTING (upstream)               NEW (our extensions)
─────────────────                 ────────────────────

place ─────────────────────────── place_details (1:1)
  │                               restaurant_details (1:1)
  │                               dish (many:1)
  │
tripitem ──────────────────────── tripitem_details (1:1)
  │                               item_route.from_item_id
  │                               item_route.to_item_id
  │
tripday ───────────────────────── day_weather (1:1)
  │                               item_route.day_id
  │
trip ──────────────────────────── trip_flight (many:1)
  │                               trip_accommodation (many:1)
  │                               trip_rental_car (many:1)
  │                               trip_budget (many:1)
  │                               trip_travel_info (1:1)
  │
(standalone)                      exchange_rate
                                  route_option (many:1 to item_route)
                                  trip_version (many:1 to trip)
```

**Cascade behavior:** All new FKs use `ondelete=CASCADE` to match upstream conventions. Deleting a Trip cascades to its reservations, budget, travel info, versions. Deleting a Place cascades to its details, restaurant info, dishes. Deleting a TripItem cascades to its details and route entries.

**`trip_version` table schema:**
- `id`: Integer PK
- `trip_id`: FK to `trip.id`, CASCADE
- `label`: String (user-provided snapshot name)
- `snapshot_json`: Text (serialized trip state — days, items, details, reservations, weather; images/attachments referenced by ID, not embedded)
- `created_at`: DateTime
- `created_by`: String (FK to `user.username`)

---

## Claude Code Skill (`/trip`)

A Claude Code skill that manages trips via the FastAPI REST API.

### Authentication
The upstream uses **JWT-based OAuth2** for all main trip endpoints (`OAuth2PasswordBearer(tokenUrl="/auth/login")`). The `api_token` field on `User` is separate — it uses an `X_Api_Token` header and only covers a narrow subset of endpoints (`/api/by_token/`: create place, list categories).

**Strategy for the skill:** The skill authenticates via username/password to obtain a JWT access token. Credentials are stored in a local `.env` file. The skill handles token refresh automatically.

Additionally, for our new extension routers, we create a shared auth dependency (`get_user_from_jwt_or_api_token()`) that accepts either JWT bearer tokens (for the Angular frontend) or `X_Api_Token` (for the skill as a lightweight fallback). This keeps both access paths working without modifying existing upstream auth code.

### Commands

```
/trip create "Istanbul & Cappadocia" --from 2026-04-10 --to 2026-04-17
/trip add-item "Hagia Sophia" --day 1 --time 09:00-11:00 --priority must-see
/trip add-restaurant "Sultanahmet Köftecisi" --day 1 --meal lunch
/trip add-flight TK1234 --date 2026-04-10
/trip add-hotel "Hotel Arcadia Blue" --checkin 2026-04-10 --checkout 2026-04-14
/trip add-car "Avis" --pickup 2026-04-14 --dropoff 2026-04-17
/trip budget --set 50000 TRY
/trip weather                    # Fetch weather forecasts for all days
/trip routes                     # Calculate transport between consecutive items
/trip summary                    # Print overview
/trip optimize --day 1           # Reorder items for shortest travel (nearest-neighbor heuristic, respects fixed-time items)
/trip version snapshot "Before rearranging day 3"
/trip version list
/trip version restore <id>
/trip version diff <id1> <id2>
/trip upstream check             # Check for new upstream releases
/trip upstream merge             # Merge upstream changes into fork
```

### Data Enrichment Flow
When adding an item/restaurant, the skill:
1. Web-searches for the place name + city
2. Extracts: coordinates, opening hours, entry fee, rating, photos, tips
3. For restaurants: also extracts cuisine, recommended dishes, prices
4. Creates or finds the `Place` (reusable — checks if it already exists)
5. Creates a `TripItem` linked to that Place on the specified day
6. Populates `place_details`, `restaurant_details`, and `dish` records

**Error handling:** If web search returns partial data, the item is created with available fields and a warning is logged. Missing fields are flagged with `[needs manual entry]` in the tips/notes field.

**Important:** Step 4 must also create a `TripPlaceLink` entry (junction table linking Place to Trip) so the Place appears in the trip's context. The upstream uses this many-to-many table — without it, Places exist but are not associated with the trip.

### Version Management
- **Snapshot:** Serializes the full trip state (trip + days + items + details + reservations + weather) to JSON, stores in `trip_version` table with a label and timestamp. Binary data (images, attachments) are referenced by ID, not embedded.
- **Restore:** Replaces current trip data with the snapshot. Warns if referenced images/users no longer exist.
- **Diff:** Compares two snapshots and shows added/removed/changed items.
- The skill is built incrementally: core commands (create, add-item, etc.) in Phase 2, version commands in Phase 4, upstream commands in Phase 5.

---

## Fork Strategy

### Principles
1. **Keep changes modular** — new model files, new Angular components, new routers. Minimize edits to core upstream files.
2. **Use Alembic** (already set up upstream) for all schema migrations.
3. **Upstream tracking** — maintain `upstream` remote, regularly fetch and merge.
4. **Extension pattern** — all new tables use 1:1 or many:1 FKs to existing tables, never modify existing columns.

### Git workflow
```
main (our fork, includes extensions)
  └── upstream/main (itskovacs/trip original)
```
- `git remote add upstream https://github.com/itskovacs/trip.git`
- Regularly `git fetch upstream && git merge upstream/main`
- Resolve conflicts in our extension files only
- Tag our releases separately from upstream

---

## Project Structure (our extensions within the upstream repo)

```
trip/                                    # Forked repo root
├── backend/
│   ├── alembic.ini                      # Existing
│   └── trip/
│       ├── main.py                      # Existing (register new routers here)
│       ├── models/
│       │   ├── models.py                # Existing (DO NOT MODIFY)
│       │   └── extensions.py            # NEW: all extension models
│       ├── routers/                     # Existing directory
│       │   ├── trips.py                 # Existing
│       │   ├── places.py                # Existing
│       │   ├── place_details.py         # NEW
│       │   ├── item_details.py          # NEW
│       │   ├── restaurants.py           # NEW
│       │   ├── item_routes.py           # NEW
│       │   ├── reservations.py          # NEW
│       │   ├── budget.py                # NEW
│       │   ├── weather.py               # NEW
│       │   ├── travel_info.py           # NEW
│       │   └── versions.py              # NEW
│       ├── alembic/
│       │   └── versions/                # NEW migration scripts here
│       └── utils/                       # Existing
├── src/                                 # Angular frontend
│   ├── src/
│   │   └── app/
│   │       ├── components/              # Existing — add new components
│   │       │   ├── restaurant-card/     # NEW
│   │       │   ├── route-connector/     # NEW
│   │       │   ├── budget-dashboard/    # NEW
│   │       │   ├── reservations/        # NEW
│   │       │   ├── weather-badge/       # NEW
│   │       │   ├── travel-info/         # NEW
│   │       │   ├── pdf-export/          # NEW
│   │       │   └── item-details-ext/    # NEW
│   │       └── services/               # Existing — add new services
│   │           ├── restaurant.service.ts    # NEW
│   │           ├── budget.service.ts        # NEW
│   │           ├── currency.service.ts      # NEW
│   │           └── version.service.ts       # NEW
│   ├── ngsw-config.json                 # Existing (PWA already configured)
│   └── package.json                     # Existing
├── skill/                               # NEW: Claude Code skill
│   └── trip.md
├── docker-compose.yml                   # Existing
└── Dockerfile                           # Existing
```

---

## Implementation Phases

### Phase 1: Fork & Foundation
1. Fork itskovacs/trip to user's GitHub
2. Clone fork, set up `upstream` remote
3. Run locally with Docker, verify it works
4. Explore the codebase: read `models.py`, key routers, Angular components
5. Create the extension models file (`extensions.py`) and first Alembic migration
6. Create the Claude Code skill skeleton (`skill/trip.md`)

### Phase 2: Core Extensions
7. Rich Place details (opening hours, rating, photos, tips, links, contact)
8. Rich TripItem details (confirmation code, priority, duration, alternatives)
9. Restaurant features (cuisine, dishes, price range)
10. Transport between items (routes with mode/distance/duration options)
11. Reservations (flights, hotels, rental cars)

### Phase 3: Visualization & Budget
12. Budget dashboard with charts (integrating existing balance system)
13. Currency conversion (exchange rates, UI toggle)
14. Weather forecasts per day
15. PDF export

### Phase 4: Intelligence & Version Control
16. Claude Code skill — data enrichment via web search (core commands)
17. Claude Code skill — version management (snapshot, diff, restore)
18. Travel requirements (visa, emergency info)
19. Unscheduled/flexible items

### Phase 5: Polish & Deployment
20. Upstream sync automation in Claude Code skill
21. UI polish, responsive design improvements
22. Enhanced offline data caching (extend existing PWA)
23. Testing, bug fixes, deployment

---

## Verification

### How to test
1. **Run locally**: `docker-compose up` — verify the forked app works identically to the original
2. **Alembic migrations**: `alembic upgrade head` — verify new tables created, existing data preserved
3. **New API endpoints**: Test each with curl/httpie, verify CRUD operations
4. **Frontend components**: Visual verification in browser — new components render correctly alongside existing UI
5. **Claude Code skill**: Test each command and verify data appears in the web UI
6. **Version management**: Create snapshot, make changes, restore, verify data integrity
7. **Budget dashboard**: Verify chart data matches actual trip costs
8. **PDF export**: Generate and verify completeness (days, items, reservations, packing list)
9. **Upstream merge**: `git fetch upstream && git merge upstream/main` — verify no regressions
