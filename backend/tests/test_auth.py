"""Administrator authentication and session handling."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_access_token, hash_password
from app.models.content import Admin
from tests.conftest import ADMIN_PASSWORD

LOGIN = "/api/v1/auth/login"


def test_admin_can_sign_in_with_correct_credentials(client, admin: Admin):
    response = client.post(LOGIN, json={"email": admin.email, "password": ADMIN_PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["expires_at"]


def test_sign_in_records_the_login_time(client, db: Session, admin: Admin):
    assert admin.last_login_at is None

    client.post(LOGIN, json={"email": admin.email, "password": ADMIN_PASSWORD})

    db.refresh(admin)
    assert admin.last_login_at is not None


def test_wrong_password_is_rejected(client, admin: Admin):
    response = client.post(LOGIN, json={"email": admin.email, "password": "not-the-password"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_unknown_email_is_rejected_identically_to_a_wrong_password(client, admin: Admin):
    unknown = client.post(LOGIN, json={"email": "nobody@example.com", "password": "whatever-123"})
    wrong = client.post(LOGIN, json={"email": admin.email, "password": "whatever-123"})

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_password_hash_is_never_returned(client, auth_headers, admin: Admin):
    response = client.get("/api/v1/auth/me", headers=auth_headers)

    assert response.status_code == 200
    assert "password" not in response.text.lower()
    assert admin.password_hash not in response.text


def test_password_is_not_stored_in_plaintext(db: Session, admin: Admin):
    assert admin.password_hash != ADMIN_PASSWORD
    assert admin.password_hash.startswith("$argon2")


def test_login_is_rate_limited_after_repeated_failures(client, admin: Admin):
    from app.core.config import settings

    for _ in range(settings.login_rate_limit_attempts):
        client.post(LOGIN, json={"email": admin.email, "password": "wrong-password"})

    blocked = client.post(LOGIN, json={"email": admin.email, "password": ADMIN_PASSWORD})

    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


def test_successful_login_clears_the_throttle(client, admin: Admin):
    client.post(LOGIN, json={"email": admin.email, "password": "wrong-password"})
    client.post(LOGIN, json={"email": admin.email, "password": ADMIN_PASSWORD})

    for _ in range(3):
        again = client.post(LOGIN, json={"email": admin.email, "password": ADMIN_PASSWORD})
        assert again.status_code == 200


def test_changing_the_password_invalidates_existing_sessions(client, auth_headers, admin: Admin):
    change = client.post(
        "/api/v1/auth/password",
        headers=auth_headers,
        json={"current_password": ADMIN_PASSWORD, "new_password": "a-brand-new-password"},
    )
    assert change.status_code == 200

    assert client.get("/api/v1/auth/me", headers=auth_headers).status_code == 401


def test_new_password_works_after_a_change(client, auth_headers, admin: Admin):
    client.post(
        "/api/v1/auth/password",
        headers=auth_headers,
        json={"current_password": ADMIN_PASSWORD, "new_password": "a-brand-new-password"},
    )

    response = client.post(LOGIN, json={"email": admin.email, "password": "a-brand-new-password"})
    assert response.status_code == 200


def test_password_change_requires_the_current_password(client, auth_headers):
    response = client.post(
        "/api/v1/auth/password",
        headers=auth_headers,
        json={"current_password": "wrong", "new_password": "a-brand-new-password"},
    )

    assert response.status_code == 401


def test_short_new_password_is_refused(client, auth_headers):
    response = client.post(
        "/api/v1/auth/password",
        headers=auth_headers,
        json={"current_password": ADMIN_PASSWORD, "new_password": "short"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer not-a-token", "Basic abc"])
def test_malformed_authorization_headers_are_rejected(client, header):
    headers = {} if header is None else {"Authorization": header}

    response = client.get("/api/v1/auth/me", headers=headers)

    assert response.status_code == 401


def test_token_for_a_deleted_admin_is_rejected(client, db: Session, admin: Admin):
    token, _ = create_access_token(admin_id=admin.id, token_version=admin.token_version)
    db.delete(admin)
    db.commit()

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_token_round_trips_its_claims():
    token, _ = create_access_token(admin_id=7, token_version=3)

    assert decode_access_token(token) == (7, 3)


def test_a_token_signed_with_another_key_is_rejected(client, admin: Admin):
    from jose import jwt

    forged = jwt.encode(
        {
            "sub": str(admin.id),
            "ver": admin.token_version,
            "typ": "admin_access",
            "exp": 9999999999,
        },
        "a-different-signing-key",
        algorithm="HS256",
    )

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})

    assert response.status_code == 401


def test_a_token_of_the_wrong_type_is_rejected(client, admin: Admin):
    from jose import jwt

    from app.core.config import settings

    wrong_type = jwt.encode(
        {
            "sub": str(admin.id),
            "ver": admin.token_version,
            "typ": "password_reset",
            "exp": 9999999999,
        },
        settings.secret_key,
        algorithm="HS256",
    )

    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {wrong_type}"})

    assert response.status_code == 401


def test_hashing_the_same_password_twice_gives_different_hashes():
    assert hash_password("same-password") != hash_password("same-password")
