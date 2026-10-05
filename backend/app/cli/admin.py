"""Create or update the single administrator account.

Run via `just admin`. Credentials come from ADMIN_EMAIL and ADMIN_PASSWORD in
the environment, are never printed, and are stored only as an argon2 hash.
"""

from __future__ import annotations

import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.security import MIN_PASSWORD_LENGTH, hash_password
from app.db.session import SessionLocal
from app.models.content import Admin


def main() -> int:
    email = (settings.admin_email or "").strip().lower()
    password = settings.admin_password or ""

    if not email:
        print("ADMIN_EMAIL is not set.", file=sys.stderr)
        return 1
    if len(password) < MIN_PASSWORD_LENGTH:
        print(
            f"ADMIN_PASSWORD must be at least {MIN_PASSWORD_LENGTH} characters. "
            "Set it in .env, then re-run `just admin`.",
            file=sys.stderr,
        )
        return 1

    with SessionLocal() as db:
        existing = db.scalars(select(Admin)).all()

        if len(existing) > 1:
            # The site is single-admin by design; more than one row means
            # something wrote to the table out of band.
            print(
                f"Found {len(existing)} admin rows, expected at most one. "
                "Inspect the `admin` table before continuing.",
                file=sys.stderr,
            )
            return 1

        if existing:
            admin = existing[0]
            admin.email = email
            admin.password_hash = hash_password(password)
            # Invalidate any session issued against the old password.
            admin.token_version += 1
            action = "updated"
        else:
            db.add(Admin(email=email, password_hash=hash_password(password)))
            action = "created"

        db.commit()

    print(f"Administrator {action}: {email}")
    if action == "updated":
        print("Existing admin sessions were invalidated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
