"""FastAPI application factory.

In production this single process serves both the API and the built React
bundle, which keeps the deployment to one container and lets the browser use
same-origin relative API paths.
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import Response

from app.api import seo
from app.api.v1 import api_router
from app.core.config import Settings, settings
from app.core.errors import register_exception_handlers
from app.core.middleware import SecurityHeadersMiddleware

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


def check_production_config(cfg: Settings) -> list[str]:
    """Configuration mistakes that must not reach production.

    Returned rather than raised so the caller decides whether to warn or
    refuse to start.
    """
    problems: list[str] = []
    if cfg.secret_key == INSECURE_DEFAULT_SECRET:
        problems.append("SECRET_KEY is still the development default. Run `just secret`.")
    if len(cfg.secret_key) < 32:
        problems.append("SECRET_KEY should be at least 32 characters.")
    if cfg.site_url.startswith("http://") and "localhost" not in cfg.site_url:
        problems.append("SITE_URL should use https:// in production.")
    if cfg.email_backend == "smtp" and not cfg.smtp_host:
        problems.append("EMAIL_BACKEND is 'smtp' but SMTP_HOST is empty.")
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

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(request: Request, full_path: str) -> Response:
        # An unknown /api path is a client error, not a page.
        if full_path.startswith(("api/", "uploads/")):
            return JSONResponse({"detail": "Not found"}, status_code=404)

        candidate = (static_dir / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
            return FileResponse(candidate)

        del request
        return FileResponse(index_file, headers={"Cache-Control": "no-cache, must-revalidate"})

    logger.info("Serving frontend from %s", static_dir)


app = create_app()
