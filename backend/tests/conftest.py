"""Test fixtures.

Tests run against a real Postgres database rather than SQLite, because the
schema uses Postgres enums and `NULLS LAST` ordering; testing on a different
engine would not exercise what production runs.

The schema is created once per session and each test runs inside a
transaction that is rolled back, so tests are isolated and fast.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

# Point the application at the test database before any app module reads
# settings, and keep secrets out of the picture entirely.
TEST_DB_NAME = os.environ.get("TEST_POSTGRES_DB", "ieee_test")
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-not-used-anywhere-real"
os.environ["EMAIL_BACKEND"] = "none"
os.environ["POSTGRES_DB"] = TEST_DB_NAME

from app.core.config import settings  # noqa: E402
from app.core.deps import get_db  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models.content import Admin  # noqa: E402

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "correct-horse-battery-staple"


def _ensure_database_exists() -> None:
    """Create the test database if it is not there yet."""
    url = make_url(settings.sqlalchemy_url)
    maintenance = create_engine(
        url.set(database="postgres"), isolation_level="AUTOCOMMIT", pool_pre_ping=True
    )
    with maintenance.connect() as connection:
        exists = connection.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": url.database}
        ).scalar()
        if not exists:
            connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    maintenance.dispose()


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    _ensure_database_exists()
    engine = create_engine(settings.sqlalchemy_url, pool_pre_ping=True)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session whose work is discarded when the test ends."""
    connection = engine.connect()
    transaction = connection.begin()
    # join_transaction_mode="create_savepoint" makes the application's own
    # commit() and rollback() operate on savepoints inside this transaction,
    # so code under test can commit (or roll back, as the content importer's
    # dry-run does) without escaping the test's isolation.
    session = sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def app(db: Session):
    """The application, wired to the test session."""
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db
    return application


@pytest.fixture
def client(app):
    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Keep one test's request volume from throttling the next."""
    from app.api.v1.auth import login_limiter
    from app.api.v1.contact import submission_limiter

    login_limiter.reset()
    submission_limiter.reset()
    yield
    login_limiter.reset()
    submission_limiter.reset()


@pytest.fixture
def admin(db: Session) -> Admin:
    record = Admin(email=ADMIN_EMAIL, password_hash=hash_password(ADMIN_PASSWORD))
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@pytest.fixture
def auth_headers(client, admin: Admin) -> dict[str, str]:
    """Authorization header for a signed-in administrator."""
    response = client.post(
        "/api/v1/auth/login", json={"email": admin.email, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
