"""Contact and collaboration form: validation, persistence and notification."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.content import ContactSubmission, InquiryType, SubmissionStatus

CONTACT = "/api/v1/contact"

VALID = {
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "message": "We would like to run a workshop with your branch next semester.",
}


def test_a_valid_submission_is_accepted(client):
    response = client.post(CONTACT, json=VALID)

    assert response.status_code == 201
    assert "id" in response.json()
    assert "created_at" in response.json()


def test_a_submission_is_persisted(client, db: Session):
    client.post(CONTACT, json=VALID)

    stored = db.scalars(select(ContactSubmission)).all()
    assert len(stored) == 1
    assert stored[0].name == "Priya Sharma"
    assert stored[0].message == VALID["message"]


def test_a_new_submission_starts_unread(client, db: Session):
    client.post(CONTACT, json=VALID)

    stored = db.scalar(select(ContactSubmission))
    assert stored.status == SubmissionStatus.NEW


def test_the_email_is_stored_lowercased(client, db: Session):
    client.post(CONTACT, json={**VALID, "email": "MixedCase@Example.COM"})

    stored = db.scalar(select(ContactSubmission))
    assert stored.email == "mixedcase@example.com"


def test_a_long_forwarded_for_header_is_rejected_not_stored(client, db: Session):
    """Regression: an over-long X-Forwarded-For used to overflow source_ip
    (VARCHAR(64)) and turn the submission into a 500."""
    response = client.post(CONTACT, json=VALID, headers={"X-Forwarded-For": "1" * 200})

    assert response.status_code == 201
    stored = db.scalar(select(ContactSubmission))
    assert stored.source_ip is not None
    assert len(stored.source_ip) <= 64


def test_a_forwarded_header_is_ignored_unless_the_peer_is_trusted(client, db: Session):
    """X-Forwarded-For is attacker-controlled, so an untrusted client cannot
    choose the address recorded or the one the rate limiter keys on."""
    client.post(CONTACT, json=VALID, headers={"X-Forwarded-For": "203.0.113.9"})

    stored = db.scalar(select(ContactSubmission))
    assert stored.source_ip != "203.0.113.9"


def test_a_collaboration_enquiry_records_its_type(client, db: Session):
    client.post(
        CONTACT,
        json={
            **VALID,
            "inquiry_type": "industry_collaboration",
            "organization": "Globex",
            "subject": "Sponsoring your hackathon",
        },
    )

    stored = db.scalar(select(ContactSubmission))
    assert stored.inquiry_type == InquiryType.INDUSTRY_COLLABORATION
    assert stored.organization == "Globex"
    assert stored.subject == "Sponsoring your hackathon"


def test_the_response_does_not_echo_the_senders_details(client):
    body = client.post(CONTACT, json=VALID).json()

    assert "email" not in body
    assert "message" not in body


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("email", "not-an-email"),
        ("email", ""),
        ("name", "A"),
        ("name", "   "),
        ("message", "too short"),
        ("inquiry_type", "not-a-real-type"),
        ("phone", "call-me-maybe"),
    ],
)
def test_invalid_fields_are_rejected(client, field, value):
    response = client.post(CONTACT, json={**VALID, field: value})

    assert response.status_code == 422
    assert field in response.json()["fields"]


def test_validation_errors_name_each_bad_field(client):
    response = client.post(CONTACT, json={"name": "A", "email": "bad", "message": "short"})

    fields = response.json()["fields"]
    assert set(fields) == {"name", "email", "message"}


def test_nothing_is_stored_when_validation_fails(client, db: Session):
    client.post(CONTACT, json={**VALID, "email": "nope"})

    assert db.scalars(select(ContactSubmission)).all() == []


def test_an_overlong_message_is_rejected(client):
    response = client.post(CONTACT, json={**VALID, "message": "x" * 5001})

    assert response.status_code == 422


def test_whitespace_is_trimmed_from_submitted_text(client, db: Session):
    client.post(CONTACT, json={**VALID, "name": "  Priya Sharma  "})

    stored = db.scalar(select(ContactSubmission))
    assert stored.name == "Priya Sharma"


def test_an_empty_optional_field_is_stored_as_absent(client, db: Session):
    client.post(CONTACT, json={**VALID, "organization": "   ", "phone": ""})

    stored = db.scalar(select(ContactSubmission))
    assert stored.organization is None
    assert stored.phone is None


def test_repeated_submissions_are_rate_limited(client, db: Session):
    for _ in range(5):
        assert client.post(CONTACT, json=VALID).status_code == 201

    blocked = client.post(CONTACT, json=VALID)

    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    assert len(db.scalars(select(ContactSubmission)).all()) == 5


def test_spoofed_forwarded_headers_cannot_evade_the_rate_limit(client, db: Session):
    """Regression: a fresh X-Forwarded-For used to reset the limiter key. With
    no trusted proxy configured, every spoofed address maps to the real peer,
    so the sixth attempt is still throttled."""
    for index in range(5):
        sent = client.post(CONTACT, json=VALID, headers={"X-Forwarded-For": f"203.0.113.{index}"})
        assert sent.status_code == 201

    blocked = client.post(CONTACT, json=VALID, headers={"X-Forwarded-For": "198.51.100.1"})

    assert blocked.status_code == 429
    assert len(db.scalars(select(ContactSubmission)).all()) == 5


def test_submissions_are_not_readable_without_authentication(client):
    client.post(CONTACT, json=VALID)

    assert client.get("/api/v1/admin/submissions").status_code == 401


def test_a_submission_is_stored_even_when_notification_is_disabled(client, db: Session):
    # EMAIL_BACKEND is "none" throughout the test suite, so this also proves
    # the stored-first ordering: no notification, submission still recorded.
    client.post(CONTACT, json=VALID)

    assert db.scalar(select(ContactSubmission)) is not None
