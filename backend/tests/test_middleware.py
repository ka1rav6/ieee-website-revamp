"""The request-body size guard."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db
from app.main import create_app

VALID = {
    "name": "Within Limits",
    "email": "within@example.com",
    "message": "This message is definitely long enough to pass validation.",
}


def test_an_oversized_body_is_refused_with_413_and_security_headers(db: Session, monkeypatch):
    # A small cap keeps the test cheap; the middleware reads it at startup.
    monkeypatch.setattr(settings, "max_request_body_mb", 1)
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db

    with TestClient(application) as test_client:
        response = test_client.post(
            "/api/v1/contact",
            content=b"x" * (settings.max_request_body_bytes + 1),
            headers={"Content-Type": "application/json"},
        )

    assert response.status_code == 413
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_a_body_within_the_limit_reaches_the_endpoint(client):
    response = client.post("/api/v1/contact", json=VALID)

    assert response.status_code == 201
