import secrets

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    FRONTEND_FOLDER: str = "frontend"
    SQLITE_FILE: str = "storage/trip.sqlite"

    ASSETS_FOLDER: str = "storage/assets"
    ASSETS_URL: str = "/api/assets"
    PLACE_IMAGE_SIZE: int = 500
    TRIP_IMAGE_SIZE: int = 600

    SECRET_KEY: str = secrets.token_hex(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 1440

    class Config:
        env_file = "storage/config.yml"


settings = Settings()
