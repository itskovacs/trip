"""JWT auth handler with token caching for TRIP API."""

import os
import time

import httpx
import jwt

_token = None
_token_expires = 0.0
_refresh_token = None

_FALLBACK_TTL_SECONDS = 25 * 60
_EXPIRY_MARGIN_SECONDS = 30


def get_api_url():
    return os.environ.get("TRIP_API_URL", "http://localhost:8080")


async def _auth_headers():
    """Pick the auth header for this request.

    TRIP_USERNAME/TRIP_PASSWORD take priority when both are set (existing JWT
    login/refresh flow); TRIP_TOKEN is the fallback, sent as-is with no login
    step since API tokens don't expire.
    """
    username = os.environ.get("TRIP_USERNAME", "")
    password = os.environ.get("TRIP_PASSWORD", "")
    if username and password:
        return {"Authorization": f"Bearer {await get_token()}"}

    api_token = os.environ.get("TRIP_TOKEN", "")
    if api_token:
        return {"X-Api-Token": api_token}

    raise RuntimeError("TRIP_USERNAME/TRIP_PASSWORD or TRIP_TOKEN env vars required")


def _compute_expiry(access_token):
    """Determine when to stop trusting the cached access token.

    Decodes the token's own `exp` claim (WITHOUT verifying the signature — this
    process has no SECRET_KEY, and it's safe here because the token was just
    obtained directly from the trusted backend, not attacker-supplied), and
    caches it until 30s before that expiry. Falls back to the old hardcoded
    25-minute window if decoding fails for any reason.
    """
    try:
        payload = jwt.decode(access_token, options={"verify_signature": False})
        exp = payload.get("exp")
        if exp:
            return exp - _EXPIRY_MARGIN_SECONDS
    except Exception:
        pass
    return time.time() + _FALLBACK_TTL_SECONDS


async def _login():
    """Full username/password login. Populates the token cache and stored refresh token."""
    global _token, _token_expires, _refresh_token
    username = os.environ.get("TRIP_USERNAME", "")
    password = os.environ.get("TRIP_PASSWORD", "")
    if not username or not password:
        raise RuntimeError("TRIP_USERNAME and TRIP_PASSWORD env vars required")
    async with httpx.AsyncClient(base_url=get_api_url()) as client:
        r = await client.post("/api/auth/login", json={"username": username, "password": password})
        r.raise_for_status()
        data = r.json()
        if "pending_code" in data:
            raise RuntimeError(
                "TOTP is enabled for this account. Disable TOTP or use an account without TOTP."
            )
        _token = data["access_token"]
        _refresh_token = data.get("refresh_token")
        _token_expires = _compute_expiry(_token)
        return _token


async def _refresh():
    """Exchange the stored refresh token for a new access token.

    /api/auth/refresh only returns a new access_token (not a new refresh
    token), so the same stored refresh token keeps being reused until it
    itself expires, at which point the caller falls back to _login().
    """
    global _token, _token_expires
    async with httpx.AsyncClient(base_url=get_api_url()) as client:
        r = await client.post("/api/auth/refresh", json={"refresh_token": _refresh_token})
        r.raise_for_status()
        data = r.json()
        _token = data["access_token"]
        _token_expires = _compute_expiry(_token)
        return _token


async def get_token():
    global _token, _token_expires
    if _token and time.time() < _token_expires:
        return _token
    if _refresh_token:
        try:
            return await _refresh()
        except Exception:
            pass  # refresh token likely expired/invalid; fall back to full login
    return await _login()


def _handle_response(response):
    """Raise a RuntimeError with the backend's error detail on 4xx/5xx responses.

    A bare raise_for_status() only surfaces a generic "400 Client Error" with
    no useful information, so pull the `detail` field out of the JSON body
    (when present) and surface that instead.
    """
    if response.status_code >= 400:
        detail = None
        try:
            detail = response.json().get("detail")
        except Exception:
            pass
        if detail:
            raise RuntimeError(f"TRIP API error ({response.status_code}): {detail}")
        response.raise_for_status()
    return response


async def api_get(path):
    headers = await _auth_headers()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        r = await client.get(path, headers=headers)
        if r.status_code == 404:
            return {}
        _handle_response(r)
        return r.json()


async def api_post(path, data):
    headers = await _auth_headers()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        r = await client.post(path, json=data, headers=headers)
        _handle_response(r)
        return r.json()


async def api_put(path, data):
    headers = await _auth_headers()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        r = await client.put(path, json=data, headers=headers)
        _handle_response(r)
        return r.json()


async def api_delete(path):
    headers = await _auth_headers()
    async with httpx.AsyncClient(base_url=get_api_url(), timeout=30) as client:
        r = await client.delete(path, headers=headers)
        _handle_response(r)
        return {"deleted": True}
