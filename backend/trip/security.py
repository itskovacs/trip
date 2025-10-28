from datetime import UTC, datetime, timedelta

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2 import exceptions as argon_exceptions
from authlib.integrations.httpx_client import OAuth2Client
from fastapi import HTTPException

from .config import settings
from .models.models import Token
from .utils.utils import httpx_get

ph = PasswordHasher()
OIDC_CONFIG = {}


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def verify_totp_code(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code)


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except (
        argon_exceptions.VerifyMismatchError,
        argon_exceptions.VerificationError,
        argon_exceptions.InvalidHashError,
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire.timestamp()})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_tokens(data: dict) -> Token:
    return Token(access_token=create_access_token(data), refresh_token=create_refresh_token(data))


def verify_exists_and_owns(username: str, obj) -> None:
    if not obj:
        raise HTTPException(status_code=404, detail="The resource does not exist")

    if obj.user != username:
        raise HTTPException(status_code=403, detail="Forbidden")

    return None


def get_oidc_client():
    return OAuth2Client(
        client_id=settings.OIDC_CLIENT_ID,
        client_secret=settings.OIDC_CLIENT_SECRET,
        scope="openid profile",
        redirect_uri=settings.OIDC_REDIRECT_URI,
    )


async def get_oidc_config():
    global OIDC_CONFIG
    if OIDC_CONFIG:
        return OIDC_CONFIG

    discovery_url = settings.OIDC_DISCOVERY_URL
    if not discovery_url:
        raise HTTPException(status_code=500, detail="OIDC_DISCOVERY_URL not configured")

    OIDC_CONFIG = await httpx_get(discovery_url)
    return OIDC_CONFIG
