"""Production configuration guardrails.

`check_production_config` is what stops an insecure deployment from booting, so
each rule gets a test: the ones that are wrong everywhere, and the ones that are
only wrong once the site is actually public.
"""

from __future__ import annotations

from app.core.config import Settings
from app.main import check_production_config

LONG_SECRET = "a-secret-key-that-is-at-least-32-characters-long"


def _production(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "environment": "production",
        "secret_key": LONG_SECRET,
        "site_url": "https://ieee.example.org",
        "postgres_password": "a-real-database-password",
        "database_url": None,
        "email_backend": "none",
    }
    base.update(overrides)
    return Settings(**base)


def test_a_clean_production_config_has_no_problems():
    assert check_production_config(_production()) == []


def test_the_default_secret_is_flagged():
    problems = check_production_config(_production(secret_key="insecure-development-key-change-me"))

    assert any("SECRET_KEY" in problem for problem in problems)


def test_a_short_secret_is_flagged():
    # Passes the field's own 16-character floor but is still under 32.
    problems = check_production_config(_production(secret_key="seventeen-char-key"))

    assert any("32 characters" in problem for problem in problems)


def test_a_localhost_site_url_is_flagged():
    problems = check_production_config(_production(site_url="http://localhost:5173"))

    assert any("localhost" in problem for problem in problems)


def test_a_plain_http_site_url_is_flagged():
    problems = check_production_config(_production(site_url="http://ieee.example.org"))

    assert any("https" in problem for problem in problems)


def test_the_default_postgres_password_is_flagged():
    problems = check_production_config(_production(postgres_password="ieee-local-dev-password"))

    assert any("POSTGRES_PASSWORD" in problem for problem in problems)


def test_a_database_url_makes_the_postgres_password_irrelevant():
    problems = check_production_config(
        _production(
            postgres_password="ieee-local-dev-password",
            database_url="postgresql+psycopg://user:pass@db:5432/app",
        )
    )

    assert not any("POSTGRES_PASSWORD" in problem for problem in problems)


def test_smtp_without_a_host_is_flagged():
    problems = check_production_config(_production(email_backend="smtp", smtp_host=""))

    assert any("SMTP_HOST" in problem for problem in problems)


def test_a_very_long_token_lifetime_is_flagged():
    problems = check_production_config(_production(access_token_expire_minutes=10080))

    assert any("ACCESS_TOKEN_EXPIRE_MINUTES" in problem for problem in problems)


def test_development_does_not_flag_local_only_defaults():
    development = Settings(
        environment="development",
        secret_key=LONG_SECRET,
        site_url="http://localhost:5173",
        postgres_password="ieee-local-dev-password",
        email_backend="console",
    )

    assert check_production_config(development) == []
