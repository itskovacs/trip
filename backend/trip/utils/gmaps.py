import re
from typing import Any

import httpx
from fastapi import HTTPException

from ..models.models import GooglePlaceResult

gmaps_types_mapper: dict[str, list] = {
    "Nature & Outdoor": ["natural_feature", "landmark"],
    "Entertainment & Leisure": ["amusement", "aquarium"],
    "Culture": ["museum", "historical", "art_", "church"],
    "Food & Drink": ["food", "bar", "bakery", "coffee_shop", "restaurant"],
    "Adventure & Sports": ["adventure_sports_center"],
    "Wellness": ["wellness"],
    "Accommodation": ["hotel", "camping"],
}


async def result_to_place(place, api_key: str) -> GooglePlaceResult:
    loc = place.get("location", {})
    result = GooglePlaceResult(
        name=place.get("displayName", {}).get("text"),
        place=place.get("displayName", {}).get("text"),
        lat=loc.get("latitude", None),
        lng=loc.get("longitude", None),
        price=compute_avg_price(place.get("priceRange")),
        types=place.get("types", []),
        allowdog=place.get("allowDogs"),
        description=compute_description(place),
    )
    if place.get("photos"):
        photo_name = place.get("photos")[0].get("name")
        if photo_name:
            result.image = await gmaps_photo(photo_name, api_key)
    place_types = set(place.get("types", []))
    for key, v in gmaps_types_mapper.items():
        if any(any(substring in place_type for place_type in place_types) for substring in v):
            result.category = key
            break
    return result


def url_to_cid(url: str) -> str | None:
    pattern = r"!1s(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)"
    match = re.search(pattern, url)
    if not match:
        return None
    cid_hex = match.group(2)
    cid_decimal = int(cid_hex, 0)
    return str(cid_decimal)


def compute_avg_price(price_range: dict | None) -> float | None:
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


def compute_description(place: dict[str, Any]):
    description = ""
    address = place.get("formattedAddress")
    phone = place.get("internationalPhoneNumber")
    website = place.get("websiteUri")

    if address:
        description += f"{address}\n"
    if phone:
        description += f"Phone: {phone}\n"
    if website:
        description += f"Website: {website}"
    return description.rstrip()


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
        cid = url_to_cid(url)
        pid = await cid_to_pid(cid, api_key)
        place = await gmaps_pid_search(pid, api_key)
        return place
    except Exception as exc:
        print("exception:", exc)
        return None


async def gmaps_textsearch(search: str, api_key: str) -> list[dict[str, Any]]:
    url = "https://places.googleapis.com/v1/places:searchText"
    body = {"textQuery": search}
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
            bounds = geometry.get("bounds")
            if not bounds:
                bounds = geometry.get("viewport")
            return bounds
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")
