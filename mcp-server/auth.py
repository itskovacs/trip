"""JWT auth handler with token caching for TRIP API."""
import os
import time
import httpx

_token = None
_token_expires = 0.0


def get_api_url():
    return os.environ.get("TRIP_API_URL", "http://localhost:8080")


async def get_token():
    global _token, _token_expires
    if _token and time.time() < _token_expires:
        return _token
    username = os.environ.get("TRIP_USERNAME", "")
    password = os.environ.get("TRIP_PASSWORD", "")
    if not username or not password:
        raise RuntimeError("TRIP_USERNAME and TRIP_PASSWORD env vars required")
    async with httpx.AsyncClient(base_url=get_api_url()) as client:
        r = await client.post("/api/auth/login", json={"username": username, "password": password})
        r.raise_for_status()
        data = r.json()
        _token = data["access_token"]
        _token_expires = time.time() + 25 * 60
        return _token


async def api_get(path):
    token = await get_token()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        r = await client.get(path, headers={"Authorization": f"Bearer {token}"})
        if r.status_code == 404:
            return {}
        r.raise_for_status()
        return r.json()


async def api_post(path, data):
    token = await get_token()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        r = await client.post(path, json=data, headers={"Authorization": f"Bearer {token}"})
        r.raise_for_status()
        return r.json()


async def api_put(path, data):
    token = await get_token()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        r = await client.put(path, json=data, headers={"Authorization": f"Bearer {token}"})
        r.raise_for_status()
        return r.json()


async def api_delete(path):
    token = await get_token()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        await client.delete(path, headers={"Authorization": f"Bearer {token}"})
        return {"deleted": True}
