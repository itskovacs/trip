from typing import Any

import httpx
from fastapi import HTTPException


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


async def gmaps_textsearch(search: str, api_key: str) -> list[dict[str, Any]]:
    url = "https://places.googleapis.com/v1/places:searchText"
    body = {"textQuery": search}
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.types,places.location,places.priceRange,places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,places.displayName,places.allowsDogs",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data.get("places", [])
    except Exception:
        raise HTTPException(status_code=400, detail="Bad Request")