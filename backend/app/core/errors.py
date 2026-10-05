"""Uniform API error responses.

Every failure the client sees is `{"detail": "..."}` with a safe message.
Unexpected exceptions are logged server-side and reported as a generic 500 so
stack traces and database internals never reach the browser.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(HTTPException):
    """Base for errors we raise deliberately, with a client-safe message."""


class NotFoundError(AppError):
    def __init__(self, detail: str = "Not found") -> None:
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ConflictError(AppError):
    def __init__(self, detail: str = "Already exists") -> None:
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class ValidationError(AppError):
    def __init__(self, detail: str = "Invalid request") -> None:
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


class AuthError(AppError):
    def __init__(self, detail: str = "Not authenticated") -> None:
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class RateLimitError(AppError):
    def __init__(self, retry_after: int, detail: str = "Too many requests") -> None:
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Flatten Pydantic's errors into field -> message so forms can show
        # them inline, without echoing back the submitted values.
        fields: dict[str, str] = {}
        for error in exc.errors():
            location = [str(part) for part in error["loc"] if part not in ("body", "query", "path")]
            fields[".".join(location) or "request"] = error["msg"]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": "Please correct the highlighted fields.", "fields": fields},
        )

    @app.exception_handler(SQLAlchemyError)
    async def _database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.exception("Database error on %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "A server error occurred. Please try again."},
        )

    @app.exception_handler(Exception)
    async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "A server error occurred. Please try again."},
        )
