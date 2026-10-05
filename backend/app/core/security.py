"""Password hashing and admin session tokens.

Passwords are hashed with Argon2id (the PHC winner and OWASP's current
recommendation). Sessions are stateless JWTs carrying a `ver` claim that is
compared against the admin's `token_version`, which lets a password change
invalidate every token already issued.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = "HS256"
TOKEN_TYPE = "admin_access"

_hasher = PasswordHasher()

# Enforced server-side; the frontend mirrors it only as a convenience.
MIN_PASSWORD_LENGTH = 12


class TokenError(Exception):
    """Raised when a token is missing, malformed, expired or superseded."""


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Check a password against its hash, returning False rather than raising."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """True when the hash was made with weaker parameters than we now use."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


def create_access_token(*, admin_id: int, token_version: int) -> tuple[str, datetime]:
    """Issue an admin access token. Returns the token and its expiry."""
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": str(admin_id),
        "ver": token_version,
        "typ": TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
    return token, expires_at


def decode_access_token(token: str) -> tuple[int, int]:
    """Validate a token and return `(admin_id, token_version)`.

    Raises TokenError for anything untrustworthy, including a token of the
    wrong type, so a future token kind can never be replayed as an admin
    session.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise TokenError("Invalid or expired token") from exc

    if payload.get("typ") != TOKEN_TYPE:
        raise TokenError("Unexpected token type")

    subject = payload.get("sub")
    version = payload.get("ver")
    if subject is None or version is None:
        raise TokenError("Malformed token payload")

    try:
        return int(subject), int(version)
    except (TypeError, ValueError) as exc:
        raise TokenError("Malformed token payload") from exc
