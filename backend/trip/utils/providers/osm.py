from typing import Any

from fastapi import HTTPException

from ...models.models import (LatLng, OSMRoutingQuery, OSMRoutingResponse,
                              ProviderBoundaries, ProviderPlaceResult)
from .base import BaseMapProvider


class OpenStreetMapProvider(BaseMapProvider):
    TYPES_MAPPER: dict[str, list[str]] = {
        "Entertainment & Leisure": [
            "amusement_arcade",
            "theme_park",
            "zoo",
            "aquarium",
            "cinema",
            "theatre",
            "arts_centre",
            "water_park",
            "escape_game",
            "bowling_alley",
            "miniature_golf",
        ],
        "Culture": [
            "monument",
            "memorial",
            "archaeological_site",
            "castle",
            "ruins",
            "fort",
            "museum",
            "gallery",
            "attraction",
            "place_of_worship",
            "church",
            "cathedral",
        ],
        "Food & Drink": [
            "restaurant",
            "cafe",
            "fast_food",
            "bar",
            "pub",
            "biergarten",
            "ice_cream",
            "bakery",
            "pastry",
            "coffee",
            "chocolate",
            "convenience",
        ],
        "Adventure & Sports": [
            "sports_centre",
            "fitness_centre",
            "stadium",
            "pitch",
            "track",
            "swimming_pool",
            "climbing",
            "swimming",
            "tennis",
            "football",
            "surfing",
        ],
        "Wellness": [
            "spa",
            "sauna",
            "massage",
            "physiotherapist",
            "doctors",
        ],
        "Accommodation": [
            "hotel",
            "hostel",
            "guest_house",
            "motel",
            "apartment",
            "chalet",
            "camp_site",
            "caravan_site",
            "resort",
        ],
        "Nature & Outdoor": [
            "park",
            "national_park",
            "viewpoint",
            "beach",
            "peak",
            "wood",
            "water",
            "river",
            "forest",
            "meadow",
        ],
    }
    USER_AGENT = "Mozilla/5.0 (compatible; TRIP/1 PyJWKClient; +https://github.com/itskovacs/trip)"
    OSRM_ENDPOINTS = {
        "car": "https://routing.openstreetmap.de/routed-car/route/v1/driving",
        "foot": "https://routing.openstreetmap.de/routed-foot/route/v1/driving",
        "bike": "https://routing.openstreetmap.de/routed-bike/route/v1/driving",
    }

    def _categorize(self, types: set[str]) -> str | None:
        for cat, keys in self.TYPES_MAPPER.items():
            if any(kw in type_val for type_val in types for kw in keys):
                return cat
        return None

    def _compute_price(self, charge: str | None) -> float | None:
        if not charge:
            return None
        try:
            amount = charge.split(" ")[0]
            amount_clean = "".join(c for c in amount if c.isdigit() or c == ".")
            return float(amount_clean) if amount_clean else None
        except (ValueError, IndexError):
            return None

    async def result_to_place(self, place: dict[str, Any]) -> ProviderPlaceResult:
        tags = place.get("extratags") or {}

        description_parts = []
        if hours := tags.get("opening_hours"):
            description_parts.append(f"Opening: {hours}")
        if phone := tags.get("contact:phone"):
            description_parts.append(f"Phone: {phone}")
        if website := tags.get("contact:website"):
            description_parts.append(f"Website: {website}")
        if address := place.get("display_name"):
            description_parts.append(address)

        place_types = {
            tags.get("amenity"),
            tags.get("historic"),
            tags.get("leisure"),
            tags.get("natural"),
            tags.get("shop"),
            tags.get("tourism"),
        }
        place_types.discard(None)

        return ProviderPlaceResult(
            name=place.get("name") or place.get("display_name", "").split(",")[0],
            place=place.get("name") or place.get("display_name", ""),
            lat=float(place.get("lat", 0)),
            lng=float(place.get("lon", 0)),
            price=self._compute_price(place.get("charge")),
            types=list(place_types),
            allowdog=tags.get("dog") and tags.get("dog") != "no",
            restroom=tags.get("toilets") == "yes",
            description="\n".join(description_parts),
            category=self._categorize(place_types),
            image=None,
        )

    async def text_search(self, query: str, location: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": 3,
            "extratags": 1,
        }
        headers = {"User-Agent": self.USER_AGENT}

        data = await self._request("GET", url, headers=headers, params=params)
        return data if isinstance(data, list) else []

    async def search_nearby(self, location: dict[str, Any], radius: float = 1600.0) -> list[dict[str, Any]]:
        raise HTTPException(status_code=400, detail="Nearby search not supported for OpenStreetMap")

    async def get_place_details(self, place_id: str, osm_type: str = "node") -> dict[str, Any]:
        raise HTTPException(status_code=400, detail="Details search not supported for OpenStreetMap")

    async def geocode(self, query: str) -> ProviderBoundaries | None:
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": query, "format": "json", "limit": 1}
        headers = {"User-Agent": self.USER_AGENT}

        data = await self._request("GET", url, headers=headers, params=params)
        bbox = data[0].get("boundingbox")
        if not bbox or len(bbox) != 4:
            return None

        try:
            south_lat, north_lat, west_lon, east_lon = map(float, bbox)
            return ProviderBoundaries(
                northeast=LatLng(lat=north_lat, lng=east_lon),
                southwest=LatLng(lat=south_lat, lng=west_lon),
            )
        except (ValueError, TypeError):
            return None

    async def get_route(self, data: OSMRoutingQuery) -> OSMRoutingResponse:
        if len(data.coordinates) < 2:
            raise HTTPException(
                status_code=400, detail="Routing impossible: at least 2 coordinates required"
            )

        if data.profile not in ["car", "foot", "bike"]:
            raise HTTPException(status_code=400, detail="Specified profile is not supported")
        coords_str = ";".join(f"{coord.lng},{coord.lat}" for coord in data.coordinates)

        url = f"{self.OSRM_ENDPOINTS[data.profile]}/{coords_str}"
        params = {
            "overview": "simplified",
            "geometries": "geojson",
            "alternatives": False,
            "steps": False,
            "annotations": False,
        }

        data = await self._request("GET", url, params=params)
        if data.get("code") != "Ok":
            raise HTTPException(status_code=400, detail=data.get("message", "Routing failed"))

        routes = data.get("routes", [])
        if not routes:
            raise HTTPException(status_code=404, detail="No route found")
        route = routes[0]
        if not route.get("geometry"):
            raise HTTPException(status_code=404, detail="No route found")
        return OSMRoutingResponse(
            distance=route.get("distance", 0),
            duration=route.get("duration", 0),
            geometry=route.get("geometry"),
        )
