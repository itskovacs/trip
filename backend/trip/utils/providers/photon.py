from typing import Any

from fastapi import HTTPException

from ...config import get_settings
from ...models.models import (LatLng, ProviderBoundaries, ProviderPlaceResult,
                              RoutingQuery, RoutingResponse)
from .base import BaseMapProvider


class PhotonProvider(BaseMapProvider):
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

    async def result_to_place(self, place: dict[str, Any]) -> ProviderPlaceResult:
        props = place.get("properties") or {}
        coords = (place.get("geometry") or {}).get("coordinates") or [0, 0]

        address_parts = []
        if street := props.get("street"):
            address_parts.append(f"{props['housenumber']} {street}" if props.get("housenumber") else street)
        for key in ("locality", "district", "city", "state", "country"):
            if value := props.get(key):
                address_parts.append(value)
        address = ", ".join(address_parts)

        name = props.get("name") or (address_parts[0] if address_parts else None)

        place_types = {props.get("osm_key"), props.get("osm_value")}
        place_types.discard(None)

        return ProviderPlaceResult(
            name=name,
            place=name,
            lat=float(coords[1]) if len(coords) > 1 else 0.0,
            lng=float(coords[0]) if coords else 0.0,
            price=None,
            types=list(place_types),
            allowdog=None,
            restroom=None,
            description=address,
            category=self._categorize(place_types),
            image=None,
            links=None,
        )

    async def text_search(self, query: str, location: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        url = get_settings().PHOTON_URL
        params: dict[str, Any] = {"q": query, "limit": 3}
        if location:
            params["lat"] = location.get("latitude")
            params["lon"] = location.get("longitude")
        headers = {"User-Agent": self.USER_AGENT}

        data = await self._request("GET", url, headers=headers, params=params)
        return data.get("features", []) if isinstance(data, dict) else []

    async def search_nearby(self, location: dict[str, Any], radius: float = 1600.0) -> list[dict[str, Any]]:
        raise HTTPException(status_code=400, detail="Nearby search not supported for Photon")

    async def get_place_details(self, place_id: str) -> dict[str, Any]:
        raise HTTPException(status_code=400, detail="Details search not supported for Photon")

    async def geocode(self, query: str) -> ProviderBoundaries | None:
        url = get_settings().PHOTON_URL
        params = {"q": query, "limit": 1}
        headers = {"User-Agent": self.USER_AGENT}

        data = await self._request("GET", url, headers=headers, params=params)
        features = data.get("features", []) if isinstance(data, dict) else []
        if not features:
            return None

        extent = (features[0].get("properties") or {}).get("extent")
        if not extent or len(extent) != 4:
            return None

        try:
            min_lon, max_lat, max_lon, min_lat = map(float, extent)
            return ProviderBoundaries(
                northeast=LatLng(lat=max_lat, lng=max_lon),
                southwest=LatLng(lat=min_lat, lng=min_lon),
            )
        except (ValueError, TypeError):
            return None

    async def get_route(self, data: RoutingQuery) -> RoutingResponse:
        if data.profile not in ["car", "foot", "bike"]:
            raise HTTPException(status_code=400, detail="Specified profile is not supported")
        coords_str = ";".join(f"{coord.lng},{coord.lat}" for coord in data.coordinates)

        url = f"{self.OSRM_ENDPOINTS[data.profile]}/{coords_str}"
        params = {
            "overview": "simplified",
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
        return RoutingResponse(
            distance=route.get("distance", 0),
            duration=route.get("duration", 0),
            coordinates=self._decode_encoded_polyline(route.get("geometry")),
        )
