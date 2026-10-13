from functools import lru_cache
from typing import List, Literal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Relay"
    ENV: str = "development"
    DEBUG: bool = False
    PORT: int = 8000

    SECRET_KEY: str = Field(
        default="demo_dev_secret_key_change_in_production_min_32_chars",
        description="JWT signing secret key",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Cookie Configuration
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_SECURE: bool = False
    COOKIE_PATH: str = "/"

    # File Size Limits (§3.4)
    GLOBAL_FILE_SIZE_LIMIT_BYTES: int = 5 * 1024 * 1024  # 5 MB demo default
    LEAD_MAX_FILE_SIZE_LIMIT_BYTES: int = 25 * 1024 * 1024  # 25 MB demo lead cap

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://relay_user:relay_password@localhost:5432/relay_db",
        description="Async PostgreSQL connection string",
    )

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        env = info.data.get("ENV", "development")
        if env.lower() == "production":
            if v == "demo_dev_secret_key_change_in_production_min_32_chars" or len(v) < 32:
                raise ValueError(
                    "Production boot refused: SECRET_KEY must be a strong secret of at least 32 characters."
                )
        return v

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def effective_cookie_samesite(self) -> Literal["lax", "strict", "none"]:
        if self.is_production:
            return "none"
        return self.COOKIE_SAMESITE

    @property
    def effective_cookie_secure(self) -> bool:
        if self.is_production:
            return True
        return self.COOKIE_SECURE


@lru_cache
def get_settings() -> Settings:
    return Settings()
