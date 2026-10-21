"""Uniform API error responses.

Every failure the client sees is `{"detail": "..."}` with a safe message.
Unexpected exceptions are logged server-side and reported as a generic 500 so
stack traces and database internals never reach the browser.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

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


class FieldError(AppError):
    """A 422 tied to specific form fields, shaped like a validation error."""

    def __init__(self, detail: str, fields: dict[str, str]) -> None:
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)
        self.fields = fields


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


def friendly_message(error: Mapping[str, Any]) -> str:
    """Pydantic's message for one error, reworded for the person at the form.

    Pydantic writes for developers ("String should have at least 3
    characters", "Input should be a valid URL, relative URL without a base").
    These messages are shown inline under admin and contact form fields, so
    the common cases are rephrased; anything unrecognised keeps Pydantic's
    wording rather than being hidden.
    """
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    message = str(error.get("msg", "Invalid value."))

    if kind == "missing":
        return "This field is required."
    if kind == "string_too_short":
        minimum = ctx.get("min_length", 1)
        if minimum <= 1:
            return "This field is required."
        return f"Use at least {minimum} characters."
    if kind == "string_too_long":
        return f"Use at most {ctx.get('max_length')} characters."
    if kind == "too_long":
        return f"Use at most {ctx.get('max_length')} items."
    if kind == "too_short":
        return f"Add at least {ctx.get('min_length')} item(s)."
    if kind.startswith("url_"):
        return "Enter a full web address, starting with https://."
    if kind in {"int_parsing", "int_type", "int_from_float"}:
        return "Enter a whole number."
    if kind in {"greater_than_equal", "greater_than"}:
        return f"Must be at least {ctx.get('ge', ctx.get('gt'))}."
    if kind in {"less_than_equal", "less_than"}:
        return f"Must be at most {ctx.get('le', ctx.get('lt'))}."
    if kind.startswith("date_") or kind.startswith("datetime_"):
        return "Enter a valid date."
    if kind == "enum":
        return "Choose one of the listed options."
    if kind == "bool_parsing":
        return "Choose yes or no."
    if kind == "value_error":
        if "valid email address" in message:
            return "Enter a valid email address, like name@example.com."
        # Our own validators raise ValueError with a sentence meant for the
        # reader; Pydantic prefixes it.
        return message.removeprefix("Value error, ")
    return message


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        content: dict[str, object] = {"detail": exc.detail}
        if isinstance(exc, FieldError):
            content["fields"] = exc.fields
        return JSONResponse(
            status_code=exc.status_code,
            content=content,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Flatten Pydantic's errors into field -> message so forms can show
        # them inline, without echoing back the submitted values.
        fields: dict[str, str] = {}
        for error in exc.errors():
            location = [str(part) for part in error["loc"] if part not in ("body", "query", "path")]
            fields[".".join(location) or "request"] = friendly_message(error)
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
