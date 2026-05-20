"""TRIP MCP Server — manage trips, places, and itineraries via AI tools."""
from fastmcp import FastMCP
from auth import api_get, api_post, api_put, api_delete

mcp = FastMCP("TRIP")

# ── Trips ──

@mcp.tool()
async def create_trip(name: str, currency: str = "EUR") -> dict:
    """Create a new trip."""
    return await api_post("/api/trips", {"name": name, "currency": currency})

@mcp.tool()
async def list_trips() -> list:
    """List all trips."""
    return await api_get("/api/trips")

@mcp.tool()
async def get_trip(trip_id: int) -> dict:
    """Get full trip with days, items, and places."""
    return await api_get(f"/api/trips/{trip_id}")

@mcp.tool()
async def update_trip(trip_id: int, name: str = "", currency: str = "", notes: str = "") -> dict:
    """Update trip name, currency, or notes."""
    data = {k: v for k, v in {"name": name, "currency": currency, "notes": notes}.items() if v}
    return await api_put(f"/api/trips/{trip_id}", data)

@mcp.tool()
async def delete_trip(trip_id: int) -> dict:
    """Delete a trip."""
    return await api_delete(f"/api/trips/{trip_id}")

@mcp.tool()
async def link_places(trip_id: int, place_ids: list[int]) -> dict:
    """Link places to a trip. Must be called before adding items with place references."""
    return await api_put(f"/api/trips/{trip_id}", {"place_ids": place_ids})

# ── Days ──

@mcp.tool()
async def add_day(trip_id: int, label: str, date: str = "") -> dict:
    """Add a day. Date: YYYY-MM-DD."""
    data = {"label": label}
    if date: data["dt"] = date
    return await api_post(f"/api/trips/{trip_id}/days", data)

@mcp.tool()
async def update_day(trip_id: int, day_id: int, label: str = "", date: str = "") -> dict:
    """Update a day."""
    data = {}
    if label: data["label"] = label
    if date: data["dt"] = date
    return await api_put(f"/api/trips/{trip_id}/days/{day_id}", data)

@mcp.tool()
async def delete_day(trip_id: int, day_id: int) -> dict:
    """Delete a day."""
    return await api_delete(f"/api/trips/{trip_id}/days/{day_id}")

# ── Items ──

@mcp.tool()
async def add_item(trip_id: int, day_id: int, text: str, time: str = "09:00",
                   price: float = 0, place_id: int = 0) -> dict:
    """Add an item to a day. Field is 'place' not 'place_id'. Place must be linked to trip first."""
    data = {"text": text, "time": time, "price": price}
    if place_id: data["place"] = place_id
    return await api_post(f"/api/trips/{trip_id}/days/{day_id}/items", data)

@mcp.tool()
async def update_item(trip_id: int, day_id: int, item_id: int, text: str = "", time: str = "") -> dict:
    """Update an item."""
    data = {}
    if text: data["text"] = text
    if time: data["time"] = time
    return await api_put(f"/api/trips/{trip_id}/days/{day_id}/items/{item_id}", data)

@mcp.tool()
async def delete_item(trip_id: int, day_id: int, item_id: int) -> dict:
    """Delete an item."""
    return await api_delete(f"/api/trips/{trip_id}/days/{day_id}/items/{item_id}")

# ── Places ──

@mcp.tool()
async def create_place(name: str, lat: float, lng: float, category_id: int = 1,
                       description: str = "", price: float = 0, duration: int = 60,
                       image_url: str = "") -> dict:
    """Create a place. Pass image_url for a photo (server downloads automatically)."""
    data = {"name": name, "lat": lat, "lng": lng, "place": name,
            "description": description, "price": price, "duration": duration,
            "category_id": category_id}
    if image_url: data["image"] = image_url
    return await api_post("/api/places", data)

@mcp.tool()
async def list_places() -> list:
    """List all places."""
    return await api_get("/api/places")

@mcp.tool()
async def update_place(place_id: int, name: str = "", description: str = "") -> dict:
    """Update a place."""
    data = {}
    if name: data["name"] = name
    if description: data["description"] = description
    return await api_put(f"/api/places/{place_id}", data)

@mcp.tool()
async def delete_place(place_id: int) -> dict:
    """Delete a place."""
    return await api_delete(f"/api/places/{place_id}")

# ── Categories ──

@mcp.tool()
async def list_categories() -> list:
    """List place categories."""
    return await api_get("/api/categories")

@mcp.tool()
async def create_category(name: str, color: str = "#3B82F6") -> dict:
    """Create a category."""
    return await api_post("/api/categories", {"name": name, "color": color})

# ── Packing & Checklist ──

@mcp.tool()
async def add_packing_item(trip_id: int, text: str, category: str = "other", quantity: int = 1) -> dict:
    """Add packing item. Categories: clothes, toiletries, tech, documents, other."""
    return await api_post(f"/api/trips/{trip_id}/packing", {"text": text, "category": category, "qt": quantity})

@mcp.tool()
async def add_checklist_item(trip_id: int, text: str) -> dict:
    """Add pre-trip checklist item."""
    return await api_post(f"/api/trips/{trip_id}/checklist", {"text": text})

# ── Sharing ──

@mcp.tool()
async def share_trip(trip_id: int, full_access: bool = False) -> dict:
    """Create a share link. full_access=True allows editing."""
    return await api_post(f"/api/trips/{trip_id}/share", {"is_full_access": full_access})

@mcp.tool()
async def invite_member(trip_id: int, username: str) -> dict:
    """Invite a user to collaborate."""
    return await api_post(f"/api/trips/{trip_id}/members", {"user": username})

if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=3001)
