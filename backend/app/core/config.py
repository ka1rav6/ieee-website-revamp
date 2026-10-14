"""Application settings, loaded from the environment.

Everything configurable lives here so that deployments differ only by
environment variables. No secret ever has a usable default.
"""

from __future__ import annotations

import functools
import ipaddress
from pathlib import Path
from typing import Literal

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PACKAGE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PACKAGE_ROOT.parent


def _default_content_dir() -> Path:
    """Locate the content/ tree.

    It sits beside the backend in a checkout and beside the app package in
    the container image, so both are checked rather than assuming a fixed
    depth. CONTENT_DIR overrides this.
    """
    for candidate in (REPO_ROOT / "content", PACKAGE_ROOT / "content"):
        if candidate.is_dir():
            return candidate
    return REPO_ROOT / "content"


Environment = Literal["development", "test", "production"]
EmailBackend = Literal["console", "smtp", "none"]

# Paired with the default SECRET_KEY: values that are fine locally but must
# never reach production, where they are refused at startup (see main.py).
INSECURE_DEFAULT_POSTGRES_PASSWORD = "ieee-local-dev-password"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path(".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Core ---
    environment: Environment = "development"
    site_url: str = "http://localhost:5173"
    api_prefix: str = "/api/v1"

    # --- Security ---
    secret_key: str = Field(min_length=16, default="insecure-development-key-change-me")
    access_token_expire_minutes: int = Field(default=720, gt=0)
    cors_origins: str = ""
    # Comma-separated IPs/CIDRs of reverse proxies whose X-Forwarded-For may be
    # trusted. Empty means the header is ignored and the socket address is
    # used, which is the safe default when the app is exposed directly.
    trusted_proxies: str = ""
    login_rate_limit_attempts: int = Field(default=5, gt=0)
    login_rate_limit_window_seconds: int = Field(default=900, gt=0)

    # --- Database ---
    database_url: str | None = None
    postgres_user: str = "ieee"
    postgres_password: str = INSECURE_DEFAULT_POSTGRES_PASSWORD
    postgres_db: str = "ieee"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # --- Administrator ---
    admin_email: str = "ieee@iiitd.ac.in"
    admin_password: str | None = None

    # --- Uploads ---
    upload_dir: Path = Path("./uploads")
    max_upload_size_mb: int = Field(default=5, gt=0, le=50)
    # Cap on any request body, enforced before it is read into memory. Kept
    # above the upload limit so image uploads still fit.
    max_request_body_mb: int = Field(default=10, gt=0, le=100)

    # --- Static frontend (production image only) ---
    static_dir: Path | None = None

    # --- Contact form notifications ---
    email_backend: EmailBackend = "console"
    email_from: str = "ieee@iiitd.ac.in"
    email_to: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True

    # --- Content ---
    content_dir: Path = Field(default_factory=_default_content_dir)

    @field_validator("site_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("trusted_proxies")
    @classmethod
    def _trusted_proxies_are_valid(cls, value: str) -> str:
        # Reject a malformed entry at startup rather than silently trusting
        # nothing (or everything) at request time.
        for entry in value.split(","):
            entry = entry.strip()
            if not entry:
                continue
            try:
                ipaddress.ip_network(entry)
            except ValueError as exc:
                raise ValueError(f"{entry!r} is not a valid IP address or CIDR") from exc
        return value

    @computed_field
    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @computed_field
    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            # Normalise the historic postgres:// form that some hosts inject.
            url = self.database_url
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg://", 1)
            elif url.startswith("postgresql://"):
                url = url.replace("postgresql://", "postgresql+psycopg://", 1)
            return url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def trusted_proxy_networks(
        self,
    ) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
        """The configured proxies, parsed. Plain property: network objects are
        not JSON-serialisable like the computed fields are."""
        return tuple(
            ipaddress.ip_network(entry.strip())
            for entry in self.trusted_proxies.split(",")
            if entry.strip()
        )

    @computed_field
    @property
    def allowed_origins(self) -> list[str]:
        """Browser origins permitted to call the API.

        In production only the site itself plus anything explicitly listed is
        allowed; the API and frontend normally share an origin, so this is
        usually just a safety net for split deployments.
        """
        origins = {o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()}
        origins.add(self.site_url)
        if not self.is_production:
            origins.update(
                {
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://localhost:4173",
                }
            )
        return sorted(o for o in origins if o)

    @computed_field
    @property
    def notification_recipient(self) -> str:
        return self.email_to.strip() or self.admin_email

    @computed_field
    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @computed_field
    @property
    def max_request_body_bytes(self) -> int:
        return self.max_request_body_mb * 1024 * 1024


@functools.lru_cache
def get_settings() -> Settings:
    """Cached settings instance. Tests clear the cache via `get_settings.cache_clear()`."""
    return Settings()


settings = get_settings()
