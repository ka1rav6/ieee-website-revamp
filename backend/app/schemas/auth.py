"""Authentication request and response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.security import MIN_PASSWORD_LENGTH


class LoginRequest(BaseModel):
    email: EmailStr
    # Not length-validated: a wrong-length guess must fail as a credential
    # error, not a validation error, so the form cannot be used to probe
    # the password policy.
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


class AdminProfile(BaseModel):
    id: int
    email: EmailStr
    last_login_at: datetime | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=256)
