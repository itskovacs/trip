"""TRIP MCP Server — manage trips, places, and itineraries via AI tools."""

from urllib.parse import quote

from fastmcp import FastMCP

from auth import api_delete, api_get, api_post, api_put

mcp = FastMCP("TRIP")

# ── Trips ──


@mcp.tool()
async def create_trip(name: str, currency: str = "EUR", notes: str = "") -> dict:
    """Create a new trip."""
    data = {"name": name, "currency": currency}
    if notes:
        data["notes"] = notes
    return await api_post("/api/trips", data)


@mcp.tool()
async def list_trips() -> list:
    """List all trips the caller owns or is a joined member of."""
    return await api_get("/api/trips")


@mcp.tool()
async def get_trip(trip_id: int) -> dict:
    """Get full trip with days, items, bookings, places, attachments, and collaborators."""
    return await api_get(f"/api/trips/{trip_id}")


@mcp.tool()
async def update_trip(
    trip_id: int,
    name: str | None = None,
    currency: str | None = None,
    notes: str | None = None,
    archived: bool | None = None,
    archival_review: str | None = None,
) -> dict:
    """Update trip fields. Only the fields you pass are changed. Setting archived=True archives
    the trip (optionally attaching an archival_review note); once archived, no further trip/day/
    item/booking/packing/checklist/member changes are accepted until it is unarchived
    (archived=False)."""
    data = {
        k: v
        for k, v in {
            "name": name,
            "currency": currency,
            "notes": notes,
            "archived": archived,
            "archival_review": archival_review,
        }.items()
        if v is not None
    }
    return await api_put(f"/api/trips/{trip_id}", data)


@mcp.tool()
async def delete_trip(trip_id: int, confirm: bool = False) -> dict:
    """Delete a trip. Destructive and irreversible. Requires confirm=True to actually execute:
    call once without confirm to review, then call again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the trip and all its "
            "days/items/bookings. Re-invoke with confirm=True to proceed."
        }
    return await api_delete(f"/api/trips/{trip_id}")


@mcp.tool()
async def link_places(trip_id: int, place_ids: list[int]) -> dict:
    """Replace the full set of places linked to a trip. Existing links not in place_ids are removed
    (this fails with a 400 if any existing item still references a place being unlinked). Must be
    called before adding items with place references."""
    return await api_put(f"/api/trips/{trip_id}", {"place_ids": place_ids})


@mcp.tool()
async def get_trip_balance(trip_id: int) -> dict:
    """Get each collaborator's expense balance for the trip (sum of item.price grouped by
    item.paid_by, split evenly across all members/owner). Only meaningful for trips with 2+
    members — returns 404 (empty dict here) otherwise."""
    return await api_get(f"/api/trips/{trip_id}/balance")


@mcp.tool()
async def list_pending_invitations() -> list:
    """List trip invitations sent to the caller that haven't been accepted or declined yet."""
    return await api_get("/api/trips/invitations")


@mcp.tool()
async def accept_trip_invite(trip_id: int) -> dict:
    """Accept a pending invitation to collaborate on a trip."""
    return await api_post(f"/api/trips/{trip_id}/members/accept", {})


@mcp.tool()
async def decline_trip_invite(trip_id: int) -> dict:
    """Decline a pending invitation to collaborate on a trip."""
    return await api_post(f"/api/trips/{trip_id}/members/decline", {})


# ── Days ──


@mcp.tool()
async def add_day(trip_id: int, label: str, date: str = "", notes: str = "") -> dict:
    """Add a day. Date: YYYY-MM-DD."""
    data = {"label": label}
    if date:
        data["dt"] = date
    if notes:
        data["notes"] = notes
    return await api_post(f"/api/trips/{trip_id}/days", data)


@mcp.tool()
async def update_day(
    trip_id: int, day_id: int, label: str, date: str | None = None, notes: str | None = None
) -> dict:
    """Update a day. label is required (use get_trip to retrieve the current value if only
    updating the date/notes)."""
    data: dict = {"label": label}
    if date is not None:
        data["dt"] = date
    if notes is not None:
        data["notes"] = notes
    return await api_put(f"/api/trips/{trip_id}/days/{day_id}", data)


@mcp.tool()
async def delete_day(trip_id: int, day_id: int, confirm: bool = False) -> dict:
    """Delete a day. Destructive and irreversible — also deletes its items and bookings. Requires
    confirm=True to actually execute: call once without confirm to review, then call again with
    confirm=True."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the day and all its "
            "items/bookings. Re-invoke with confirm=True to proceed."
        }
    return await api_delete(f"/api/trips/{trip_id}/days/{day_id}")


# ── Items ──


@mcp.tool()
async def add_item(
    trip_id: int,
    day_id: int,
    text: str,
    time: str = "09:00",
    price: float = 0,
    place_id: int = 0,
    comment: str = "",
    lat: float | None = None,
    lng: float | None = None,
    status: str | None = None,
    paid_by: str = "",
    attachment_ids: list[int] | None = None,
) -> dict:
    """Add an item to a day. Field is 'place' not 'place_id'. Place must be linked to trip first
    (see link_places). lat/lng are a freeform pin independent of place_id (e.g. for a stop with no
    linked Place). paid_by must be the trip owner or a joined member (see list_trip_members).
    attachment_ids must reference attachments already uploaded to this trip. Status:
    pending/booked/constraint/optional."""
    data = {"text": text, "time": time, "price": price}
    if place_id:
        data["place"] = place_id
    if comment:
        data["comment"] = comment
    if lat is not None:
        data["lat"] = lat
    if lng is not None:
        data["lng"] = lng
    if status is not None:
        data["status"] = status
    if paid_by:
        data["paid_by"] = paid_by
    if attachment_ids is not None:
        data["attachment_ids"] = attachment_ids
    return await api_post(f"/api/trips/{trip_id}/days/{day_id}/items", data)


@mcp.tool()
async def update_item(
    trip_id: int,
    day_id: int,
    item_id: int,
    text: str | None = None,
    time: str | None = None,
    price: float | None = None,
    status: str | None = None,
    place_id: int | None = None,
    remove_place: bool = False,
    comment: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    paid_by: str | None = None,
    clear_paid_by: bool = False,
    move_to_day_id: int | None = None,
    attachment_ids: list[int] | None = None,
) -> dict:
    """Update an item. Only the fields you pass are changed; omitted fields are left as-is.
    In particular, omitting place_id preserves the item's existing place reference (it is NOT
    cleared) — you don't need to pass place_id just to keep the current place. Pass place_id to
    set/replace the place, or set remove_place=True to detach it. If you need to inspect the
    current place reference first, note that get_trip's item.place field is a nested place object
    (not a bare place id) — use item.place.id. Similarly pass paid_by to set/replace who paid, or
    clear_paid_by=True to unset it. Pass move_to_day_id to move the item to a different day of the
    same trip. Pass attachment_ids (can be []) to replace the item's attachment set. Status:
    pending/booked/constraint/optional."""
    data: dict = {}
    if text is not None:
        data["text"] = text
    if time is not None:
        data["time"] = time
    if price is not None:
        data["price"] = price
    if status is not None:
        data["status"] = status
    if comment is not None:
        data["comment"] = comment
    if lat is not None:
        data["lat"] = lat
    if lng is not None:
        data["lng"] = lng
    if remove_place:
        data["place"] = None
    elif place_id is not None:
        data["place"] = place_id
    if clear_paid_by:
        data["paid_by"] = ""
    elif paid_by is not None:
        data["paid_by"] = paid_by
    if move_to_day_id is not None:
        data["day_id"] = move_to_day_id
    if attachment_ids is not None:
        data["attachment_ids"] = attachment_ids
    return await api_put(f"/api/trips/{trip_id}/days/{day_id}/items/{item_id}", data)


@mcp.tool()
async def delete_item(trip_id: int, day_id: int, item_id: int, confirm: bool = False) -> dict:
    """Delete an item. Destructive and irreversible. Requires confirm=True to actually execute:
    call once without confirm to review, then call again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the item. Re-invoke "
            "with confirm=True to proceed."
        }
    return await api_delete(f"/api/trips/{trip_id}/days/{day_id}/items/{item_id}")


# ── Bookings ──
# A booking is a per-day reservation record (flight/hotel/car/train/boat/activity/generic),
# distinct from itinerary items — e.g. the hotel confirmation for a day vs. the sightseeing items.


@mcp.tool()
async def add_booking(
    trip_id: int,
    day_id: int,
    label: str,
    type: str = "generic",
    reference: str = "",
    notes: str = "",
    attachment_ids: list[int] | None = None,
) -> dict:
    """Add a booking to a day. Type: flight/car/hotel/activity/train/boat/generic. reference is
    typically a confirmation number. attachment_ids must reference attachments already uploaded to
    this trip."""
    data = {"label": label, "type": type}
    if reference:
        data["reference"] = reference
    if notes:
        data["notes"] = notes
    if attachment_ids is not None:
        data["attachment_ids"] = attachment_ids
    return await api_post(f"/api/trips/{trip_id}/days/{day_id}/bookings", data)


@mcp.tool()
async def update_booking(
    booking_id: int,
    label: str | None = None,
    type: str | None = None,
    reference: str | None = None,
    notes: str | None = None,
    move_to_day_id: int | None = None,
    attachment_ids: list[int] | None = None,
) -> dict:
    """Update a booking. Only the fields you pass are changed. Pass move_to_day_id to move the
    booking to a different day of the same trip. Pass attachment_ids (can be []) to replace the
    booking's attachment set."""
    data: dict = {}
    if label is not None:
        data["label"] = label
    if type is not None:
        data["type"] = type
    if reference is not None:
        data["reference"] = reference
    if notes is not None:
        data["notes"] = notes
    if move_to_day_id is not None:
        data["day_id"] = move_to_day_id
    if attachment_ids is not None:
        data["attachment_ids"] = attachment_ids
    return await api_put(f"/api/bookings/{booking_id}", data)


@mcp.tool()
async def delete_booking(booking_id: int, confirm: bool = False) -> dict:
    """Delete a booking. Destructive and irreversible. Requires confirm=True to actually execute:
    call once without confirm to review, then call again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the booking. Re-invoke "
            "with confirm=True to proceed."
        }
    return await api_delete(f"/api/bookings/{booking_id}")


# ── Places ──


@mcp.tool()
async def search_places(query: str) -> list:
    """Search real-world places by name/address via the configured map provider (OpenStreetMap or
    Google, depending on the account's settings). Returns candidate results with name/lat/lng/
    description/etc — nothing is saved. Use this to find accurate coordinates before calling
    create_place, rather than guessing lat/lng."""
    return await api_get(f"/api/completions/search?q={quote(query)}")


@mcp.tool()
async def bulk_resolve_places(queries: list[str]) -> list:
    """Resolve a batch of place names/addresses (or Google Maps URLs) to place candidates in one
    call via the configured map provider. Like search_places but for many queries at once — each
    query returns at most one best-match result (or is silently dropped if unresolvable). Nothing
    is saved; use the results to call create_place."""
    return await api_post("/api/completions/bulk", queries)


@mcp.tool()
async def create_place(
    name: str,
    lat: float,
    lng: float,
    category_id: int,
    description: str = "",
    price: float = 0,
    duration: int = 60,
    image_url: str = "",
    allowdog: bool | None = None,
    favorite: bool | None = None,
    restroom: bool | None = None,
    links: list[str] | None = None,
) -> dict:
    """Create a place. Pass image_url for a photo (server downloads automatically).
    category_id must be one of the caller's own categories (see list_categories) — the
    backend does not verify ownership, so an arbitrary id can silently attach a category
    that belongs to a different user. Consider search_places first to get accurate lat/lng."""
    data = {
        "name": name,
        "lat": lat,
        "lng": lng,
        "place": name,
        "description": description,
        "price": price,
        "duration": duration,
        "category_id": category_id,
    }
    if image_url:
        data["image"] = image_url
    if allowdog is not None:
        data["allowdog"] = allowdog
    if favorite is not None:
        data["favorite"] = favorite
    if restroom is not None:
        data["restroom"] = restroom
    if links is not None:
        data["links"] = links
    return await api_post("/api/places", data)


@mcp.tool()
async def list_places() -> list:
    """List all of the caller's places."""
    return await api_get("/api/places")


@mcp.tool()
async def get_place(place_id: int) -> dict:
    """Get a single place, including its GPX track data if present (list_places omits the raw
    GPX to keep the response small)."""
    return await api_get(f"/api/places/{place_id}")


@mcp.tool()
async def update_place(
    place_id: int,
    name: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    category_id: int | None = None,
    description: str | None = None,
    price: float | None = None,
    duration: int | None = None,
    image_url: str | None = None,
    allowdog: bool | None = None,
    favorite: bool | None = None,
    visited: bool | None = None,
    restroom: bool | None = None,
    links: list[str] | None = None,
) -> dict:
    """Update a place. Only the fields you pass are changed."""
    data = {}
    if name is not None:
        data["name"] = name
        data["place"] = name
    if lat is not None:
        data["lat"] = lat
    if lng is not None:
        data["lng"] = lng
    if category_id is not None:
        data["category_id"] = category_id
    if description is not None:
        data["description"] = description
    if price is not None:
        data["price"] = price
    if duration is not None:
        data["duration"] = duration
    if image_url is not None:
        data["image"] = image_url
    if allowdog is not None:
        data["allowdog"] = allowdog
    if favorite is not None:
        data["favorite"] = favorite
    if visited is not None:
        data["visited"] = visited
    if restroom is not None:
        data["restroom"] = restroom
    if links is not None:
        data["links"] = links
    return await api_put(f"/api/places/{place_id}", data)


@mcp.tool()
async def delete_place(place_id: int, confirm: bool = False) -> dict:
    """Delete a place. Destructive and irreversible — also removes it from any trips it's linked
    to. Requires confirm=True to actually execute: call once without confirm to review, then call
    again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the place. Re-invoke "
            "with confirm=True to proceed."
        }
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


@mcp.tool()
async def update_category(category_id: int, name: str | None = None, color: str | None = None) -> dict:
    """Update a category. Only the fields you pass are changed."""
    data = {}
    if name is not None:
        data["name"] = name
    if color is not None:
        data["color"] = color
    return await api_put(f"/api/categories/{category_id}", data)


@mcp.tool()
async def delete_category(category_id: int, confirm: bool = False) -> dict:
    """Delete a category. Destructive and irreversible — this CASCADES and also permanently
    deletes every place assigned to this category (and removes them from any trips they're linked
    to). Requires confirm=True to actually execute: call once without confirm to review, then call
    again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the category AND every "
            "place assigned to it. Re-invoke with confirm=True to proceed."
        }
    return await api_delete(f"/api/categories/{category_id}")


# ── Packing list ──


@mcp.tool()
async def list_packing_items(trip_id: int) -> list:
    """List a trip's packing list items."""
    return await api_get(f"/api/trips/{trip_id}/packing")


@mcp.tool()
async def add_packing_item(trip_id: int, text: str, category: str = "other", quantity: int = 1) -> dict:
    """Add packing item. Categories: clothes, toiletries, tech, documents, other."""
    return await api_post(
        f"/api/trips/{trip_id}/packing", {"text": text, "category": category, "qt": quantity}
    )


@mcp.tool()
async def update_packing_item(
    trip_id: int,
    item_id: int,
    text: str | None = None,
    category: str | None = None,
    quantity: int | None = None,
    packed: bool | None = None,
) -> dict:
    """Update a packing list item. Only the fields you pass are changed. Categories: clothes,
    toiletries, tech, documents, other."""
    data = {}
    if text is not None:
        data["text"] = text
    if category is not None:
        data["category"] = category
    if quantity is not None:
        data["qt"] = quantity
    if packed is not None:
        data["packed"] = packed
    return await api_put(f"/api/trips/{trip_id}/packing/{item_id}", data)


@mcp.tool()
async def delete_packing_item(trip_id: int, item_id: int, confirm: bool = False) -> dict:
    """Delete a packing list item. Requires confirm=True to actually execute: call once without
    confirm to review, then call again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the packing item. "
            "Re-invoke with confirm=True to proceed."
        }
    return await api_delete(f"/api/trips/{trip_id}/packing/{item_id}")


# ── Checklist ──


@mcp.tool()
async def list_checklist_items(trip_id: int) -> list:
    """List a trip's pre-trip checklist items."""
    return await api_get(f"/api/trips/{trip_id}/checklist")


@mcp.tool()
async def add_checklist_item(trip_id: int, text: str) -> dict:
    """Add pre-trip checklist item."""
    return await api_post(f"/api/trips/{trip_id}/checklist", {"text": text})


@mcp.tool()
async def update_checklist_item(
    trip_id: int, item_id: int, text: str | None = None, checked: bool | None = None
) -> dict:
    """Update a checklist item. Only the fields you pass are changed."""
    data = {}
    if text is not None:
        data["text"] = text
    if checked is not None:
        data["checked"] = checked
    return await api_put(f"/api/trips/{trip_id}/checklist/{item_id}", data)


@mcp.tool()
async def delete_checklist_item(trip_id: int, item_id: int, confirm: bool = False) -> dict:
    """Delete a checklist item. Requires confirm=True to actually execute: call once without
    confirm to review, then call again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this permanently deletes the checklist item. "
            "Re-invoke with confirm=True to proceed."
        }
    return await api_delete(f"/api/trips/{trip_id}/checklist/{item_id}")


# ── Sharing & members ──


@mcp.tool()
async def get_trip_share(trip_id: int) -> dict:
    """Get the trip's existing public share link details, if any (empty dict if not shared)."""
    return await api_get(f"/api/trips/{trip_id}/share")


@mcp.tool()
async def share_trip(trip_id: int, full_access: bool = False) -> dict:
    """Create a share link. full_access=True allows editing. Fails with 409 if the trip is
    already shared — use get_trip_share to see the existing link, or unshare_trip first to
    replace it."""
    return await api_post(f"/api/trips/{trip_id}/share", {"is_full_access": full_access})


@mcp.tool()
async def unshare_trip(trip_id: int, confirm: bool = False) -> dict:
    """Revoke the trip's public share link. Anyone using the old link immediately loses access.
    Requires confirm=True to actually execute: call once without confirm to review, then call
    again with confirm=True to proceed."""
    if not confirm:
        return {
            "error": "Confirmation required: this immediately revokes the existing share link "
            "for anyone using it. Re-invoke with confirm=True to proceed."
        }
    return await api_delete(f"/api/trips/{trip_id}/share")


@mcp.tool()
async def list_trip_members(trip_id: int) -> list:
    """List the trip's owner plus all members (invited, pending, and joined)."""
    return await api_get(f"/api/trips/{trip_id}/members")


@mcp.tool()
async def invite_member(trip_id: int, username: str) -> dict:
    """Invite a user to collaborate. They must accept before they can access the trip or be set as
    paid_by on items/appear in get_trip_balance."""
    return await api_post(f"/api/trips/{trip_id}/members", {"user": username})


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=3001)
