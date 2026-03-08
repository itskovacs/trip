import re
import secrets

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=["storage/config.yml", "storage/config.env"],
    )

    FRONTEND_FOLDER: str = "frontend"
    SQLITE_FILE: str = "storage/trip.sqlite"
    ASSETS_FOLDER: str = "storage/assets"
    ASSETS_URL: str = "/api/assets"
    PLACE_IMAGE_SIZE: int = 500
    TRIP_IMAGE_SIZE: int = 600
    ATTACHMENTS_FOLDER: str = "storage/attachments"
    ATTACHMENT_MAX_SIZE: int = 10 * 1024 * 1024  # 10MB
    BACKUPS_FOLDER: str = "storage/backups"

    SECRET_KEY: str = secrets.token_hex(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 1440

    REGISTER_ENABLE: bool = True
    OIDC_DISCOVERY_URL: str = ""
    OIDC_CLIENT_ID: str = ""
    OIDC_CLIENT_SECRET: str = ""
    OIDC_REDIRECT_URI: str = ""

    DEFAULT_TILE: str = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    DEFAULT_CURRENCY: str = "€"
    DEFAULT_MAP_LAT: float = 48.107
    DEFAULT_MAP_LNG: float = -2.988

    @field_validator("OIDC_CLIENT_SECRET", mode="before")
    @classmethod
    def validate_oidc_secret_client(cls, value: str) -> str:
        if not value:
            return value
        if re.search(r'[#$\\"]', value):
            raise ValueError(
                "Config file unsupported characters: OIDC_CLIENT_SECRET contains unsupported characters ('#', '$', '\\', '\"'). Wrap the value in single quotes (like OIDC_CLIENT_SECRET='your_secret_here')"
            )
        return value


settings = Settings()
