"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AuthError
from app.core.security import TokenError, decode_access_token
from app.db.session import get_db
from app.models.content import Admin

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False so a missing header produces our own 401 shape rather than
# Starlette's, keeping every error response identical.
_bearer = HTTPBearer(auto_error=False, description="Admin access token")


def get_current_admin(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> Admin:
    """Resolve the authenticated administrator, or raise 401.

    Every admin endpoint depends on this; there is no code path that reads an
    admin identity from the request body or a query parameter.
    """
    if credentials is None or not credentials.credentials:
        raise AuthError()

    try:
        admin_id, token_version = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise AuthError(str(exc)) from exc

    admin = db.scalar(select(Admin).where(Admin.id == admin_id))
    if admin is None:
        raise AuthError("Invalid or expired token")

    # A password change bumps token_version, retiring tokens issued before it.
    if admin.token_version != token_version:
        raise AuthError("Session expired, please sign in again")

    return admin


CurrentAdmin = Annotated[Admin, Depends(get_current_admin)]


def client_ip(request: Request) -> str:
    """Best-effort client address for rate limiting.

    X-Forwarded-For is only consulted because the production container sits
    behind a reverse proxy. It is used for rate-limit keys and abuse records
    only, never for authorisation.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


ClientIp = Annotated[str, Depends(client_ip)]
