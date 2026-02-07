import re
from typing import Any

from ...models.models import ProviderBoundaries, ProviderPlaceResult
from .base import BaseMapProvider


class GoogleMapsProvider(BaseMapProvider):
    TYPES_MAPPER: dict[str, list[str]] = {
        "Entertainment & Leisure": ["amusement", "aquarium", "cinema", "theatre"],
        "Culture": ["monument", "historical_place", "museum", "historical", "art_", "church", "cathedral"],
        "Food & Drink": ["food", "bar", "bakery", "coffee_shop", "restaurant", "cafe", "fast_food", "pub"],
        "Adventure & Sports": ["adventure_sports_center", "sports_centre", "climbing", "swimming"],
        "Wellness": ["wellness", "spa", "sauna", "massage"],
        "Accommodation": ["hotel", "camping", "hostel", "camp_site", "guest_house"],
        "Nature & Outdoor": ["natural_feature", "landmark", "park", "viewpoint", "beach", "nature_reserve"],
    }
    CID_PATTERN: re.Pattern[str] = re.compile(r"(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)")
    SHORTLINK_PATTERN: re.Pattern[str] = re.compile(r"maps\.app\.goo\.gl/([a-zA-Z0-9]+)")

    def _categorize(self, types: set[str]) -> str | None:
        for cat, keys in self.TYPES_MAPPER.items():
            if any(kw in type_val for type_val in types for kw in keys):
                return cat
        return None

    def _url_to_cid(self, url: str) -> str | None:
        if match := self.CID_PATTERN.search(url):
            return str(int(match.group(2), 0))
        return None

    async def _cid_to_pid(self, cid: str) -> str:
        url = "https://maps.googleapis.com/maps/api/place/details/json"
        params = {"cid": cid, "key": self.api_key, "fields": "place_id"}

        data = await self._request("POST", url, params=params)
        return data.get("result", {}).get("place_id")

    async def _get_photo(self, name: str) -> str | None:
        url = f"https://places.googleapis.com/v1/{name}/media"
        params = {"key": self.api_key, "maxWidthPx": 1000}

        try:
            result = await self._request("GET", url, params=params, follow_redirects=True)
            return result if isinstance(result, str) else None
        except Exception:
            return None

    async def _resolve_shortlink(self, link_id: str) -> str:
        url = f"https://maps.app.goo.gl/{link_id}"
        return await self._request("GET", url, follow_redirects=True)

    def _compute_avg_price(self, price_range: dict | None) -> float | None:
        if not price_range:
            return None

        start = price_range.get("startPrice", {}).get("units")
        end = price_range.get("endPrice", {}).get("units")

        if start and end:
            return (int(start) + int(end)) / 2
        return int(start) if start else int(end) if end else None

    async def result_to_place(self, place: dict[str, Any]) -> ProviderPlaceResult:
        loc = place.get("location", {})

        description_parts = []
        if hours := place.get("regularOpeningHours", {}).get("weekdayDescriptions"):
            description_parts.append(f"Opening: \n  {'\n  '.join(hours)}")
        if phone := place.get("internationalPhoneNumber"):
            description_parts.append(f"Phone: {phone}")
        if website := place.get("websiteUri"):
            description_parts.append(f"Website: {website}")
        if address := place.get("formattedAddress"):
            description_parts.append(address)

        result = ProviderPlaceResult(
            name=place.get("displayName", {}).get("text"),
            place=place.get("displayName", {}).get("text"),
            lat=loc.get("latitude"),
            lng=loc.get("longitude"),
            price=self._compute_avg_price(place.get("priceRange")),
            types=place.get("types", []),
            allowdog=place.get("allowsDogs"),
            restroom=place.get("restroom"),
            description="\n".join(description_parts),
        )

        if photos := place.get("photos"):
            if photo_name := photos[0].get("name"):
                result.image = await self._get_photo(photo_name)

        result.category = self._categorize(set(place.get("types", [])))
        return result

    async def text_search(self, query: str, location: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        url = "https://places.googleapis.com/v1/places:searchText"
        body = {"textQuery": query}

        if location:
            body["locationBias"] = {"circle": {"center": location, "radius": 400.0}}

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": "places.id,places.types,places.location,places.priceRange,"
            "places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,"
            "places.displayName,places.allowsDogs,places.photos,places.restroom,places.regularOpeningHours.weekdayDescriptions",
        }

        data = await self._request("POST", url, headers=headers, json=body)
        return data.get("places", [])

    async def search_nearby(self, location: dict[str, Any], radius: float = 1600.0) -> list[dict[str, Any]]:
        url = "https://places.googleapis.com/v1/places:searchNearby"
        body = {
            "locationRestriction": {"circle": {"center": location, "radius": radius}},
            "maxResultCount": 15,
        }
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": "places.id,places.types,places.location,places.priceRange,"
            "places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,"
            "places.displayName,places.allowsDogs,places.photos,places.restroom,places.regularOpeningHours.weekdayDescriptions",
        }

        data = await self._request("POST", url, headers=headers, json=body)
        return data.get("places", [])

    async def get_place_details(self, place_id: str) -> dict[str, Any]:
        url = f"https://places.googleapis.com/v1/places/{place_id}"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": "id,types,location,priceRange,formattedAddress,websiteUri,"
            "internationalPhoneNumber,displayName,allowsDogs,photos,restroom,regularOpeningHours.weekdayDescriptions",
        }

        return await self._request("GET", url, headers=headers)

    async def url_to_place(self, url: str) -> dict[str, Any] | None:
        try:
            # parse shortlink
            if match := self.SHORTLINK_PATTERN.search(url):
                url = await self._resolve_shortlink(match.group(1))

            # Extract CID and convert to Place ID
            if not (cid := self._url_to_cid(url)):
                return None

            place_id = await self._cid_to_pid(cid)
            return await self.get_place_details(place_id)

        except Exception:
            return None

    async def geocode(self, name: str) -> ProviderBoundaries | None:
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {"address": name, "key": self.api_key}

        data = await self._request("GET", url, params=params)

        if data.get("status") != "OK" or not data.get("results"):
            return None

        geometry = data["results"][0].get("geometry", {})
        bbox = geometry.get("bounds") or geometry.get("viewport")
        return ProviderBoundaries(**bbox)
