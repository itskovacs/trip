import logging
import re
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

LEGACY_CONFIG_FILE = Path("storage/config.yml")
CONFIG_FILE = Path("storage/config.env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=CONFIG_FILE,
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


# hot reload through cache
@lru_cache
def get_settings() -> Settings:
    return Settings()


def reload_settings() -> Settings:
    get_settings.cache_clear()
    return get_settings()


def update_config(updates: dict) -> Settings:
    if not updates:
        return get_settings()

    # preserve lines/comments
    lines: list[str] = []
    existing: dict[str, str] = {}

    if CONFIG_FILE.exists():
        for line in CONFIG_FILE.read_text().splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                k, _, v = stripped.partition("=")
                existing[k.strip()] = v.strip()
            lines.append(line)

    for key, value in updates.items():
        str_value = str(value)
        field = Settings.model_fields.get(key)
        # not set default values in config file
        default = str(field.default) if field is not None else None

        if key in existing or str_value != default:
            if key in existing:
                lines = [
                    f"{key}={str_value}"
                    if (line.strip().startswith(f"{key}=") or line.strip().split("=")[0].strip() == key)
                    else line
                    for line in lines
                ]
            else:
                lines.append(f"{key}={str_value}")

    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text("\n".join(lines) + "\n")

    return reload_settings()


def migrate_config_file():
    if not LEGACY_CONFIG_FILE.exists():
        return

    from .utils.utils import backup_file
    dst = backup_file(LEGACY_CONFIG_FILE)
    logger.warn(f"[CONFIG] Legacy config file (config.yml) backed up to {dst}")

    if CONFIG_FILE.exists():
        LEGACY_CONFIG_FILE.unlink()
        logger.warn("[CONFIG] Legacy config file (config.yml) deleted")
        return

    LEGACY_CONFIG_FILE.rename(CONFIG_FILE)
    logger.warn("[CONFIG] Legacy config file (config.yml) renamed to config.env")


migrate_config_file()
