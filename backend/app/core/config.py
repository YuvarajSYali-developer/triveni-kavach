"""Environment-based application settings."""

from __future__ import annotations

import secrets
import warnings
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Triveni Kavach"
    APP_ENV: str = "development"  # development | test | production
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = f"sqlite:///{(BACKEND_DIR / 'triveni_kavach.db').as_posix()}"

    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_ALGORITHM: str = "HS256"
    BCRYPT_ROUNDS: int = 12  # lowered only in the test suite for speed

    # Comma-separated list of allowed browser origins.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    MODEL_ARTIFACT_DIR: Path = BACKEND_DIR / "ml_artifacts"
    # Species the screening module accepts. Must be a subset of the model's species.
    SCREENING_ENABLED_SPECIES: str = "Pig"

    # Simulated telemetry generator (software-only demo of the IoT concept).
    ENABLE_TELEMETRY_SIMULATOR: bool = True
    # No physical device has been integrated or tested; keep disabled.
    ALLOW_DEVICE_SOURCE: bool = False

    LOG_LEVEL: str = "INFO"

    # Live weather from Open-Meteo (free, no key; attribution required: CC BY 4.0).
    WEATHER_ENABLED: bool = True
    WEATHER_API_URL: str = "https://api.open-meteo.com/v1/forecast"
    WEATHER_CACHE_MINUTES: int = 30
    WEATHER_TIMEOUT_SECONDS: float = 8.0

    # Open Government Data Platform India (data.gov.in). Each user registers for their own key.
    DATA_GOV_IN_API_KEY: str = ""
    DATA_GOV_IN_API_URL: str = "https://api.data.gov.in/resource"

    # Failed sign-in attempts allowed per e-mail + client address in the window below.
    LOGIN_MAX_FAILURES: int = 8
    LOGIN_WINDOW_MINUTES: int = 15

    @field_validator("DATABASE_URL")
    @classmethod
    def _db_url(cls, v: str) -> str:
        # Hosted Postgres providers (Neon, Render) hand out postgres:// or postgresql:// URLs;
        # SQLAlchemy needs the driver named explicitly.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v

    @field_validator("APP_ENV")
    @classmethod
    def _env(cls, v: str) -> str:
        v = v.lower()
        if v not in {"development", "test", "production"}:
            raise ValueError("APP_ENV must be development, test or production")
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def screening_species(self) -> list[str]:
        return [s.strip() for s in self.SCREENING_ENABLED_SPECIES.split(",") if s.strip()]

    def check_production(self) -> None:
        """Refuse unsafe configurations when APP_ENV=production."""
        if self.APP_ENV != "production":
            return
        self.resolved_secret_key()
        if self.DATABASE_URL.startswith("sqlite"):
            raise RuntimeError("Use PostgreSQL (DATABASE_URL) in production; SQLite files are lost on hosted platforms.")
        if any("localhost" in o or "127.0.0.1" in o for o in self.cors_origins):
            raise RuntimeError("CORS_ORIGINS must list the public frontend URL in production, not localhost.")

    def resolved_secret_key(self) -> str:
        if self.SECRET_KEY:
            return self.SECRET_KEY
        if self.APP_ENV == "production":
            raise RuntimeError("SECRET_KEY must be set when APP_ENV=production")
        return _ephemeral_secret()


@lru_cache
def _ephemeral_secret() -> str:
    warnings.warn(
        "SECRET_KEY is not set; using an ephemeral random key. Tokens will be invalid "
        "after a restart. Set SECRET_KEY in .env.",
        stacklevel=2,
    )
    return secrets.token_urlsafe(48)


@lru_cache
def get_settings() -> Settings:
    return Settings()
