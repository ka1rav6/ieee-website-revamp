"""Shared FastAPI dependencies."""

from __future__ import annotations

import ipaddress
import logging
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AuthError
from app.core.security import TokenError, decode_access_token
from app.db.session import get_db
from app.models.content import Admin

DbSession = Annotated[Session, Depends(get_db)]

logger = logging.getLogger("app.auth")

# One message for every reason a token is refused, so the response cannot be
# used to tell a forged signature from a wrong token type.
INVALID_TOKEN = "Invalid or expired token"

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
        # Log the specific reason server-side; never return it to the client.
        logger.info("Rejected admin token: %s", exc)
        raise AuthError(INVALID_TOKEN) from exc

    admin = db.scalar(select(Admin).where(Admin.id == admin_id))
    if admin is None:
        raise AuthError(INVALID_TOKEN)

    # A password change bumps token_version, retiring tokens issued before it.
    if admin.token_version != token_version:
        raise AuthError("Session expired, please sign in again")

    return admin


CurrentAdmin = Annotated[Admin, Depends(get_current_admin)]


# Matches ContactSubmission.source_ip, the longest place the address is stored.
# The returned value is a validated IP or the socket address, both of which
# fit; the cap is a final guard so nothing can overflow the column.
MAX_CLIENT_IP_LENGTH = 64


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


def _peer_is_trusted_proxy(request: Request) -> bool:
    """Whether the request arrived directly from a configured reverse proxy."""
    networks = settings.trusted_proxy_networks
    if not networks or request.client is None:
        return False
    try:
        peer = ipaddress.ip_address(request.client.host)
    except ValueError:
        return False
    return any(peer in network for network in networks)


def client_ip(request: Request) -> str:
    """Best-effort client address for rate limiting.

    X-Forwarded-For is attacker-controlled and is therefore only believed when
    the request arrived from a trusted reverse proxy (TRUSTED_PROXIES).
    Otherwise the socket address is used. The result is used for rate-limit
    keys and abuse records only, never for authorisation.
    """
    if _peer_is_trusted_proxy(request):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            candidate = forwarded.split(",")[0].strip()
            if _is_ip(candidate):
                return candidate[:MAX_CLIENT_IP_LENGTH]

    peer = request.client.host if request.client else "unknown"
    return peer[:MAX_CLIENT_IP_LENGTH]


ClientIp = Annotated[str, Depends(client_ip)]
