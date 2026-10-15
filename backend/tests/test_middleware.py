"""Request handling around the routes: the body size guard and frontend serving."""

from __future__ import annotations

import pytest
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


@pytest.fixture
def spa_client(db: Session, tmp_path, monkeypatch):
    """The app serving a stand-in frontend build."""
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>shell</title>")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    monkeypatch.setattr(settings, "static_dir", tmp_path)
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db
    with TestClient(application) as test_client:
        yield test_client


def test_a_head_request_for_a_page_succeeds(spa_client):
    response = spa_client.head("/events")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")


def test_a_client_side_route_gets_the_app_shell(spa_client):
    assert "shell" in spa_client.get("/blogs/some-post").text


def test_a_missing_file_is_a_404_not_the_app_shell(spa_client):
    response = spa_client.get("/logowhite.png")

    assert response.status_code == 404


def test_an_existing_static_file_is_served(spa_client):
    assert spa_client.get("/favicon.svg").status_code == 200
