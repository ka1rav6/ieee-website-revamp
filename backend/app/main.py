"""FastAPI application factory.

In production this single process serves both the API and the built React
bundle, which keeps the deployment to one container and lets the browser use
same-origin relative API paths.
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path, PurePosixPath

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.engine import make_url
from starlette.requests import Request
from starlette.responses import Response

from app.api import seo
from app.api.v1 import api_router
from app.core.config import (
    INSECURE_DEFAULT_POSTGRES_PASSWORD,
    Settings,
    settings,
)
from app.core.errors import register_exception_handlers
from app.core.middleware import MaxBodySizeMiddleware, SecurityHeadersMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("app")

INSECURE_DEFAULT_SECRET = "insecure-development-key-change-me"

DESCRIPTION = """
API for the IEEE IIIT Delhi student branch website.

Public endpoints are unauthenticated and expose only published content.
Everything under `/admin` requires the administrator's bearer token.
"""


def _uses_default_database_password(cfg: Settings) -> bool:
    """Whether the database is reached with the development password.

    DATABASE_URL overrides the POSTGRES_* parts, so it is the URL's password
    that matters when one is set.
    """
    if cfg.database_url:
        return make_url(cfg.sqlalchemy_url).password == INSECURE_DEFAULT_POSTGRES_PASSWORD
    return cfg.postgres_password == INSECURE_DEFAULT_POSTGRES_PASSWORD


def check_production_config(cfg: Settings) -> list[str]:
    """Configuration mistakes that must not reach production.

    Returned rather than raised so the caller decides whether to warn or
    refuse to start. The environment-specific checks are only reported for
    production, so a normal development setup stays quiet.
    """
    problems: list[str] = []
    if cfg.secret_key == INSECURE_DEFAULT_SECRET:
        problems.append("SECRET_KEY is still the development default. Run `just secret`.")
    if len(cfg.secret_key) < 32:
        problems.append("SECRET_KEY should be at least 32 characters.")
    if cfg.email_backend == "smtp" and not cfg.smtp_host:
        problems.append("EMAIL_BACKEND is 'smtp' but SMTP_HOST is empty.")

    if cfg.is_production:
        if "localhost" in cfg.site_url or "127.0.0.1" in cfg.site_url:
            problems.append("SITE_URL still points at localhost. Set the public https URL.")
        elif cfg.site_url.startswith("http://"):
            problems.append("SITE_URL should use https:// in production.")

        if cfg.database_url is None and cfg.postgres_password == INSECURE_DEFAULT_POSTGRES_PASSWORD:
            problems.append("POSTGRES_PASSWORD is still the development default.")
        if cfg.access_token_expire_minutes > 1440:
            problems.append("ACCESS_TOKEN_EXPIRE_MINUTES is longer than 24 hours.")
    return problems


@asynccontextmanager
async def lifespan(app: FastAPI):
    problems = check_production_config(settings)
    if settings.is_production and problems:
        # Refusing to boot is safer than serving a site with a guessable
        # token signing key.
        for problem in problems:
            logger.critical("Configuration error: %s", problem)
        sys.exit("Refusing to start with an insecure production configuration.")
    for problem in problems:
        logger.warning("Configuration warning: %s", problem)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Starting in %s mode, serving %s", settings.environment, settings.site_url)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="IEEE IIIT Delhi",
        description=DESCRIPTION,
        version="1.0.0",
        lifespan=lifespan,
        # Interactive docs are a development convenience, not a public page.
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )

    register_exception_handlers(app)

    app.add_middleware(
        SecurityHeadersMiddleware,
        enable_hsts=settings.is_production,
        # The dev server serves the frontend from a different origin, and
        # Vite's HMR client would be blocked by the production CSP.
        enable_csp=settings.is_production,
    )
    # Added before CORS so CORS is outermost and still decorates a 413.
    app.add_middleware(
        MaxBodySizeMiddleware,
        max_bytes=settings.max_request_body_bytes,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=3600,
    )

    app.include_router(api_router, prefix=settings.api_prefix)
    app.include_router(seo.router)

    _mount_uploads(app)
    _mount_frontend(app)
    return app


def _mount_uploads(app: FastAPI) -> None:
    """Serve admin-uploaded images."""
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/uploads",
        StaticFiles(directory=settings.upload_dir),
        name="uploads",
    )


def _resolve_static_dir() -> Path | None:
    """Locate the built frontend, if this deployment serves one."""
    if settings.static_dir is not None:
        return settings.static_dir if settings.static_dir.is_dir() else None
    candidate = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    return candidate if candidate.is_dir() else None


def _mount_frontend(app: FastAPI) -> None:
    """Serve the React bundle and let client-side routing handle deep links.

    Hashed asset files get a long cache lifetime; index.html must not be
    cached, or a browser would keep loading a stale bundle after a deploy.
    """
    static_dir = _resolve_static_dir()
    if static_dir is None:
        logger.info("No built frontend found; serving the API only.")
        return

    index_file = static_dir / "index.html"
    app.mount(
        "/assets",
        StaticFiles(directory=static_dir / "assets", check_dir=False),
        name="assets",
    )

    # HEAD as well as GET: uptime monitors and link checkers commonly probe
    # with HEAD, and a 405 there reads as the site being down.
    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_spa(request: Request, full_path: str) -> Response:
        # An unknown /api path is a client error, not a page.
        if full_path.startswith(("api/", "uploads/")):
            return JSONResponse({"detail": "Not found"}, status_code=404)

        candidate = (static_dir / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
            return FileResponse(candidate)

        # Client-side routes never contain a file extension (slugs are
        # [a-z0-9-]), so a missing "/logo.png" is a missing file. Answering it
        # with the HTML shell would hand an <img> a 200 it cannot render and
        # hide broken links from checkers.
        if PurePosixPath(full_path).suffix:
            return JSONResponse({"detail": "Not found"}, status_code=404)

        del request
        return FileResponse(index_file, headers={"Cache-Control": "no-cache, must-revalidate"})

    logger.info("Serving frontend from %s", static_dir)


app = create_app()
