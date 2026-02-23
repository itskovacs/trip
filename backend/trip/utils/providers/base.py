from abc import ABC, abstractmethod
from typing import Any

import httpx
from fastapi import HTTPException

from ...models.models import ProviderPlaceResult, RoutingQuery, RoutingResponse


class BaseMapProvider(ABC):
    TYPES_MAPPER: dict[str, list[str]] = {}
    TIMEOUT = 10

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key

    @abstractmethod
    def _categorize(self, types: set[str]) -> str | None:
        pass

    @abstractmethod
    async def result_to_place(self, place: dict[str, Any]) -> ProviderPlaceResult:
        pass

    @abstractmethod
    async def text_search(self, query: str, location: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    async def search_nearby(self, location: dict[str, Any], radius: float = 1600.0) -> list[dict[str, Any]]:
        pass

    @abstractmethod
    async def get_place_details(self, place_id: str) -> dict[str, Any]:
        pass

    @abstractmethod
    async def get_route(self, data: RoutingQuery) -> RoutingResponse:
        pass

    async def _request(
        self,
        method: str,
        url: str,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        follow_redirects: bool = False,
    ) -> dict[str, Any] | str:
        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                response = await client.request(
                    method, url, headers=headers, params=params, json=json, follow_redirects=follow_redirects
                )
                response.raise_for_status()
                return response.json() if method != "GET" or not follow_redirects else str(response.url)

        except httpx.HTTPStatusError as exc:
            error_msg = "Request failed"
            try:
                error_msg = exc.response.json().get("error", {}).get("message", error_msg)
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=error_msg)

        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    def _decode_encoded_polyline(self, encoded: str) -> list[tuple[float, float]]:
        # based on gist.github.com/signed0/2031157 and nejohnson2/d41a27dea7b267986cce
        # todo: use https://pypi.org/project/polyline/
        coordinates = []
        index = 0
        lat = 0
        lng = 0
        length = len(encoded)

        try:
            while index < length:
                # Decode lat
                result = 0
                shift = 0
                while True:
                    if index >= length:
                        raise ValueError("Truncated polyline string")
                    byte = ord(encoded[index]) - 63
                    index += 1
                    result |= (byte & 0x1F) << shift
                    shift += 5
                    if byte < 0x20:
                        break

                lat += ~(result >> 1) if result & 1 else (result >> 1)

                # Decode lng
                result = 0
                shift = 0
                while True:
                    if index >= length:
                        raise ValueError("Truncated polyline string")
                    byte = ord(encoded[index]) - 63
                    index += 1
                    result |= (byte & 0x1F) << shift
                    shift += 5
                    if byte < 0x20:
                        break

                lng += ~(result >> 1) if result & 1 else (result >> 1)
                coordinates.append([lng * 1e-5, lat * 1e-5])

        except Exception:
            raise ValueError("Malformed polyline string")

        return coordinates
