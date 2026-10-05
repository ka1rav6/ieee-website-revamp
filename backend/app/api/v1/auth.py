"""Administrator authentication.

One account, bearer-token sessions, and a per-IP attempt limit on login.
Failures are deliberately indistinguishable so the endpoint cannot be used to
discover whether an address is the administrator's.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import ClientIp, CurrentAdmin, DbSession
from app.core.errors import AuthError, RateLimitError
from app.core.rate_limit import RateLimiter
from app.core.security import (
    create_access_token,
    hash_password,
    needs_rehash,
    verify_password,
)
from app.models.content import Admin
from app.schemas.auth import AdminProfile, LoginRequest, PasswordChangeRequest, TokenResponse
from app.schemas.common import Message

router = APIRouter(prefix="/auth", tags=["auth"])

login_limiter = RateLimiter(
    limit=settings.login_rate_limit_attempts,
    window_seconds=settings.login_rate_limit_window_seconds,
)

INVALID_CREDENTIALS = "Incorrect email or password"


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession, ip: ClientIp) -> TokenResponse:
    retry_after = login_limiter.check(f"login:{ip}")
    if retry_after is not None:
        raise RateLimitError(
            retry_after,
            detail="Too many sign-in attempts. Please try again later.",
        )

    admin = db.scalar(select(Admin).where(Admin.email == payload.email.lower()))
    if admin is None or not verify_password(payload.password, admin.password_hash):
        raise AuthError(INVALID_CREDENTIALS)

    # Opportunistically upgrade a hash made with older argon2 parameters.
    if needs_rehash(admin.password_hash):
        admin.password_hash = hash_password(payload.password)

    admin.last_login_at = datetime.now(UTC)
    db.commit()

    # A correct password clears the throttle so one admin's typos cannot lock
    # them out for the rest of the window.
    login_limiter.reset(f"login:{ip}")

    token, expires_at = create_access_token(admin_id=admin.id, token_version=admin.token_version)
    return TokenResponse(access_token=token, expires_at=expires_at)


@router.get("/me", response_model=AdminProfile)
def read_current_admin(admin: CurrentAdmin) -> AdminProfile:
    return AdminProfile.model_validate(admin, from_attributes=True)


@router.post("/password", response_model=Message)
def change_password(payload: PasswordChangeRequest, admin: CurrentAdmin, db: DbSession) -> Message:
    if not verify_password(payload.current_password, admin.password_hash):
        raise AuthError("Current password is incorrect")

    admin.password_hash = hash_password(payload.new_password)
    # Retire every token issued before this change, including the one used to
    # make the request.
    admin.token_version += 1
    db.commit()
    return Message(detail="Password updated. Please sign in again.")


@router.post("/logout", response_model=Message, status_code=status.HTTP_200_OK)
def logout(admin: CurrentAdmin) -> Message:
    """Acknowledge sign-out.

    Tokens are stateless, so the client discards it. Password change is the
    mechanism for forcibly invalidating sessions.
    """
    del admin
    return Message(detail="Signed out")
