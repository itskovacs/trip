import re
from typing import Any

import httpx
from fastapi import HTTPException

from ..models.models import GooglePlaceResult

GMAPS_TYPES_MAPPER: dict[str, list] = {
    "Entertainment & Leisure": ["amusement", "aquarium"],
    "Culture": ["monument", "historical_place", "museum", "historical", "art_", "church"],
    "Food & Drink": ["food", "bar", "bakery", "coffee_shop", "restaurant"],
    "Adventure & Sports": ["adventure_sports_center"],
    "Wellness": ["wellness"],
    "Accommodation": ["hotel", "camping"],
    "Nature & Outdoor": ["natural_feature", "landmark"],
}

CID_PATTERN: re.Pattern[str] = re.compile(r"(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)")


async def result_to_place(place: dict[str, Any], api_key: str) -> GooglePlaceResult:
    loc = place.get("location", {})
    result = GooglePlaceResult(
        name=place.get("displayName", {}).get("text"),
        place=place.get("displayName", {}).get("text"),
        lat=loc.get("latitude", None),
        lng=loc.get("longitude", None),
        price=_compute_avg_price(place.get("priceRange")),
        types=place.get("types", []),
        allowdog=place.get("allowsDogs"),
        description=_compute_description(place),
    )
    if photos := place.get("photos"):
        if photo_name := photos[0].get("name"):
            result.image = await gmaps_photo(photo_name, api_key)
    place_types = set(place.get("types", []))
    for category, kwords in GMAPS_TYPES_MAPPER.items():
        if any(any(substring in place_type for place_type in place_types) for substring in kwords):
            result.category = category
            break
    return result


def url_to_cid(url: str) -> str | None:
    if match := CID_PATTERN.search(url):
        return str(int(match.group(2), 0))
    return None


def _compute_avg_price(price_range: dict | None) -> float | None:
    if not price_range:
        return None

    start = price_range.get("startPrice", {}).get("units")
    end = price_range.get("endPrice", {}).get("units")

    if start and end:
        return (int(start) + int(end)) / 2
    elif start:
        return int(start)
    elif end:
        return int(end)
    else:
        return None


def _compute_description(place: dict[str, Any]) -> str:
    description: list[str] = []
    if address := place.get("formattedAddress"):
        description.append(address)

    if phone := place.get("internationalPhoneNumber"):
        description.append(f"Phone: {phone}")

    if website := place.get("websiteUri"):
        description.append(f"Website: {website}")

    return "\n".join(description)


async def cid_to_pid(cid: str, api_key: str) -> str | None:
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {"cid": cid, "key": api_key, "fields": "place_id"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, params=params)
            response.raise_for_status()
            data = response.json()
            return data.get("result", {}).get("place_id")
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")


async def gmaps_pid_search(pid: str, api_key: str) -> dict[str, Any]:
    url = f"https://places.googleapis.com/v1/places/{pid}"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "id,types,location,priceRange,formattedAddress,websiteUri,internationalPhoneNumber,displayName,allowsDogs,photos",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")


async def gmaps_url_to_search(url: str, api_key: str) -> dict[str, Any] | None:
    try:
        if not (cid := url_to_cid(url)):
            return None

        pid = await cid_to_pid(cid, api_key)
        return await gmaps_pid_search(pid, api_key)
    except Exception:
        return None


async def gmaps_textsearch(
    search: str, api_key: str, location: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    url = "https://places.googleapis.com/v1/places:searchText"
    body = {"textQuery": search}
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.types,places.location,places.priceRange,places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,places.displayName,places.allowsDogs,places.photos",
    }
    if location:
        body["locationBias"] = {"circle": {"center": location, "radius": 400.0}}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data.get("places", [])
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")


async def gmaps_photo(name: str, api_key: str) -> str | None:
    url = f"https://places.googleapis.com/v1/{name}/media"
    params = {"key": api_key, "maxWidthPx": 1000}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, follow_redirects=True)
            response.raise_for_status()
            return str(response.url) if response.url else None
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")


async def gmaps_get_boundaries(name: str, api_key: str) -> dict[str, Any] | None:
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": name, "key": api_key}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            if data.get("status") != "OK" or not data.get("results"):
                return None

            result = data["results"][0]
            geometry = result.get("geometry", {})

            return geometry.get("bounds") or geometry.get("viewport")
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")


async def gmaps_nearbysearch(location: dict[str, Any], api_key: str) -> list[dict[str, Any]]:
    url = "https://places.googleapis.com/v1/places:searchNearby"
    body = {
        "locationRestriction": {"circle": {"center": location, "radius": 1600.0}},
        "maxResultCount": 15,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.types,places.location,places.priceRange,places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,places.displayName,places.allowsDogs,places.photos",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data.get("places", [])
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")


async def gmaps_resolve_shortlink(id: str) -> str:
    url = f"https://maps.app.goo.gl/{id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            return str(response.url)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")
