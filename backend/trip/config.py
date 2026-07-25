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

# Marker returned in place of the real OIDC client secret on read, and treated
# as "unchanged" (i.e. dropped from the update) when received on write.
OIDC_CLIENT_SECRET_MASK = "********"


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
    BACKUP_IMPORT_MAX_ENTRY_SIZE: int = 100 * 1024 * 1024  # 100MB
    BACKUP_IMPORT_MAX_TOTAL_SIZE: int = 500 * 1024 * 1024  # 500MB
    KML_MAX_ENTRY_SIZE: int = 50 * 1024 * 1024  # 50MB
    PROVIDER_IMPORT_MAX_SIZE: int = 20 * 1024 * 1024  # 20MB

    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 1440

    REGISTER_ENABLE: bool = True
    BOOTSTRAP_ADMIN_USERNAME: str = ""
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

    oidc_keys = {"OIDC_DISCOVERY_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"}
    if oidc_keys & updates.keys():
        # deferred import: security.py imports get_settings from this module,
        # so a top-level import here would create a circular import
        from .security import invalidate_oidc_cache

        invalidate_oidc_cache()

    return reload_settings()


def migrate_config_file():
    if not LEGACY_CONFIG_FILE.exists():
        return

    from .utils.utils import backup_file

    dst = backup_file(LEGACY_CONFIG_FILE)
    logger.warning(f"[CONFIG] Legacy config file (config.yml) backed up to {dst}")

    if CONFIG_FILE.exists():
        LEGACY_CONFIG_FILE.unlink()
        logger.warning("[CONFIG] Legacy config file (config.yml) deleted")
        return

    LEGACY_CONFIG_FILE.rename(CONFIG_FILE)
    logger.warning("[CONFIG] Legacy config file (config.yml) renamed to config.env")


def ensure_secret_key():
    settings = get_settings()
    if not settings.SECRET_KEY:
        update_config({"SECRET_KEY": secrets.token_hex(32)})
