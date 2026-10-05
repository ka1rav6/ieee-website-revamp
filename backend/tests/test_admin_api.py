"""Admin endpoints: authorization, content management and the inbox."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models.content import SubmissionStatus, TeamCategory
from tests.factories import (
    make_alumnus,
    make_category,
    make_collaboration,
    make_event,
    make_member,
    make_post,
)

# Every admin surface, so a new unprotected route gets noticed.
ADMIN_GET_ENDPOINTS = [
    "/api/v1/admin/blogs",
    "/api/v1/admin/blogs/categories",
    "/api/v1/admin/team",
    "/api/v1/admin/alumni",
    "/api/v1/admin/collaborations",
    "/api/v1/admin/events",
    "/api/v1/admin/ieee-day",
    "/api/v1/admin/submissions",
    "/api/v1/admin/submissions/unread-count",
    "/api/v1/admin/settings",
]


@pytest.mark.parametrize("endpoint", ADMIN_GET_ENDPOINTS)
def test_unauthenticated_users_cannot_read_admin_endpoints(client, endpoint):
    response = client.get(endpoint)

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "endpoint"),
    [
        ("post", "/api/v1/admin/blogs"),
        ("post", "/api/v1/admin/team"),
        ("post", "/api/v1/admin/alumni"),
        ("post", "/api/v1/admin/collaborations"),
        ("post", "/api/v1/admin/events"),
        ("put", "/api/v1/admin/settings"),
        ("put", "/api/v1/admin/ieee-day/2026"),
        ("post", "/api/v1/admin/uploads"),
    ],
)
def test_unauthenticated_users_cannot_write_through_admin_endpoints(client, method, endpoint):
    response = getattr(client, method)(endpoint, json={})

    assert response.status_code == 401


def test_a_valid_token_grants_access(client, auth_headers):
    response = client.get("/api/v1/admin/blogs", headers=auth_headers)

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Blog management
# ---------------------------------------------------------------------------


def test_admin_can_create_a_draft_blog(client, auth_headers):
    response = client.post(
        "/api/v1/admin/blogs",
        headers=auth_headers,
        json={
            "title": "A New Article",
            "body": "## Introduction\n\nSome content here.",
            "author_name": "An Author",
            "is_published": False,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["slug"] == "a-new-article"
    assert body["is_published"] is False


def test_a_newly_created_draft_is_not_publicly_visible(client, auth_headers):
    client.post(
        "/api/v1/admin/blogs",
        headers=auth_headers,
        json={
            "title": "Hidden Draft",
            "body": "Secret.",
            "author_name": "A",
            "is_published": False,
        },
    )

    assert client.get("/api/v1/blogs/hidden-draft").status_code == 404
    assert client.get("/api/v1/blogs").json()["total"] == 0


def test_admin_can_publish_a_draft_and_it_becomes_public(client, auth_headers):
    created = client.post(
        "/api/v1/admin/blogs",
        headers=auth_headers,
        json={"title": "To Publish", "body": "Content.", "author_name": "A", "is_published": False},
    ).json()

    published = client.post(
        f"/api/v1/admin/blogs/{created['id']}/publish",
        headers=auth_headers,
        params={"published": True},
    )

    assert published.status_code == 200
    assert published.json()["is_published"] is True
    assert published.json()["published_at"] is not None
    assert client.get("/api/v1/blogs/to-publish").status_code == 200


def test_admin_can_unpublish_a_post_and_it_disappears(client, auth_headers, db: Session):
    post = make_post(db, slug="live-post", published=True)
    assert client.get("/api/v1/blogs/live-post").status_code == 200

    client.post(
        f"/api/v1/admin/blogs/{post.id}/publish", headers=auth_headers, params={"published": False}
    )

    assert client.get("/api/v1/blogs/live-post").status_code == 404


def test_admin_can_edit_a_post(client, auth_headers, db: Session):
    post = make_post(db, slug="editable", title="Original Title")

    response = client.patch(
        f"/api/v1/admin/blogs/{post.id}",
        headers=auth_headers,
        json={"title": "Revised Title"},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Revised Title"
    assert response.json()["slug"] == "editable"


def test_editing_one_field_leaves_the_others_untouched(client, auth_headers, db: Session):
    post = make_post(db, slug="partial", title="Keep Me", author="Original Author")

    client.patch(f"/api/v1/admin/blogs/{post.id}", headers=auth_headers, json={"is_featured": True})

    body = client.get(f"/api/v1/admin/blogs/{post.id}", headers=auth_headers).json()
    assert body["title"] == "Keep Me"
    assert body["author_name"] == "Original Author"
    assert body["is_featured"] is True


def test_admin_can_delete_a_post(client, auth_headers, db: Session):
    post = make_post(db, slug="doomed")

    response = client.delete(f"/api/v1/admin/blogs/{post.id}", headers=auth_headers)

    assert response.status_code == 200
    assert client.get("/api/v1/blogs/doomed").status_code == 404


def test_admin_listing_includes_drafts(client, auth_headers, db: Session):
    make_post(db, slug="live", published=True)
    make_post(db, slug="draft", published=False)

    body = client.get("/api/v1/admin/blogs", headers=auth_headers).json()

    assert body["total"] == 2


def test_duplicate_titles_get_distinct_slugs(client, auth_headers):
    payload = {"title": "Same Title", "body": "x", "author_name": "A"}

    first = client.post("/api/v1/admin/blogs", headers=auth_headers, json=payload).json()
    second = client.post("/api/v1/admin/blogs", headers=auth_headers, json=payload).json()

    assert first["slug"] == "same-title"
    assert second["slug"] == "same-title-2"


def test_an_explicitly_requested_duplicate_slug_is_a_conflict(client, auth_headers, db: Session):
    make_post(db, slug="taken")

    response = client.post(
        "/api/v1/admin/blogs",
        headers=auth_headers,
        json={"title": "Another", "body": "x", "author_name": "A", "slug": "taken"},
    )

    assert response.status_code == 409


def test_tags_are_created_on_demand_and_returned(client, auth_headers):
    response = client.post(
        "/api/v1/admin/blogs",
        headers=auth_headers,
        json={
            "title": "Tagged",
            "body": "x",
            "author_name": "A",
            "tags": ["Machine Learning", "hardware"],
        },
    )

    assert response.status_code == 201
    assert {tag["name"] for tag in response.json()["tags"]} == {"Machine Learning", "hardware"}


def test_assigning_an_unknown_category_fails(client, auth_headers):
    response = client.post(
        "/api/v1/admin/blogs",
        headers=auth_headers,
        json={"title": "Orphan", "body": "x", "author_name": "A", "category_slug": "nope"},
    )

    assert response.status_code == 404


def test_a_category_in_use_cannot_be_deleted(client, auth_headers, db: Session):
    category = make_category(db, slug="in-use", name="In Use")
    make_post(db, slug="uses-category", category=category)

    response = client.delete("/api/v1/admin/blogs/categories/in-use", headers=auth_headers)

    assert response.status_code == 409


def test_an_unused_category_can_be_deleted(client, auth_headers, db: Session):
    make_category(db, slug="unused", name="Unused")

    response = client.delete("/api/v1/admin/blogs/categories/unused", headers=auth_headers)

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Team, alumni, collaborations, events
# ---------------------------------------------------------------------------


def test_admin_can_add_a_team_member(client, auth_headers):
    response = client.post(
        "/api/v1/admin/team",
        headers=auth_headers,
        json={"name": "New Member", "category": "core", "position": "Secretary"},
    )

    assert response.status_code == 201
    assert response.json()["slug"] == "new-member"
    assert client.get("/api/v1/team").json()[0]["name"] == "New Member"


def test_admin_can_change_a_members_position_and_category(client, auth_headers, db: Session):
    member = make_member(db, slug="promoted", category=TeamCategory.EXECUTIVE, position="Member")

    response = client.patch(
        f"/api/v1/admin/team/{member.id}",
        headers=auth_headers,
        json={"position": "Webmaster", "category": "core"},
    )

    assert response.status_code == 200
    assert response.json()["position"] == "Webmaster"
    assert response.json()["category"] == "core"


def test_admin_can_reorder_team_members(client, auth_headers, db: Session):
    first = make_member(db, slug="first", name="First")
    second = make_member(db, slug="second", name="Second")

    response = client.post(
        "/api/v1/admin/team/reorder", headers=auth_headers, json={"ids": [second.id, first.id]}
    )

    assert response.status_code == 200
    assert [m["slug"] for m in client.get("/api/v1/team").json()] == ["second", "first"]


def test_reordering_with_an_unknown_id_fails(client, auth_headers, db: Session):
    member = make_member(db, slug="only")

    response = client.post(
        "/api/v1/admin/team/reorder", headers=auth_headers, json={"ids": [member.id, 99999]}
    )

    assert response.status_code == 404


def test_admin_can_remove_a_team_member(client, auth_headers, db: Session):
    member = make_member(db, slug="leaving")

    response = client.delete(f"/api/v1/admin/team/{member.id}", headers=auth_headers)

    assert response.status_code == 200
    assert client.get("/api/v1/team").json() == []


def test_admin_can_update_alumni_information(client, auth_headers, db: Session):
    alumnus = make_alumnus(db, slug="an-alum")

    response = client.patch(
        f"/api/v1/admin/alumni/{alumnus.id}",
        headers=auth_headers,
        json={"current_role": "Staff Engineer", "current_organization": "Globex"},
    )

    assert response.status_code == 200
    public = client.get("/api/v1/alumni").json()[0]
    assert public["current_role"] == "Staff Engineer"
    assert public["current_organization"] == "Globex"


def test_admin_can_add_and_delete_an_alumnus(client, auth_headers):
    created = client.post(
        "/api/v1/admin/alumni",
        headers=auth_headers,
        json={"name": "Fresh Graduate", "graduation_year": 2026},
    )
    assert created.status_code == 201

    deleted = client.delete(f"/api/v1/admin/alumni/{created.json()['id']}", headers=auth_headers)

    assert deleted.status_code == 200
    assert client.get("/api/v1/alumni").json() == []


def test_admin_can_update_collaboration_information(client, auth_headers, db: Session):
    collaboration = make_collaboration(db, slug="acme")

    response = client.patch(
        f"/api/v1/admin/collaborations/{collaboration.id}",
        headers=auth_headers,
        json={"collaboration_type": "Workshop partner", "year": 2025},
    )

    assert response.status_code == 200
    public = client.get("/api/v1/collaborations").json()[0]
    assert public["collaboration_type"] == "Workshop partner"
    assert public["year"] == 2025


def test_admin_can_create_an_event(client, auth_headers):
    response = client.post(
        "/api/v1/admin/events",
        headers=auth_headers,
        json={"title": "Hack Night", "event_date": "2026-11-01", "location": "R&D Block"},
    )

    assert response.status_code == 201
    assert response.json()["slug"] == "hack-night"


def test_admin_can_unpublish_an_event(client, auth_headers, db: Session):
    event = make_event(db, slug="cancelled")

    client.patch(
        f"/api/v1/admin/events/{event.id}", headers=auth_headers, json={"is_published": False}
    )

    assert client.get("/api/v1/events").json()["total"] == 0


# ---------------------------------------------------------------------------
# IEEE Day
# ---------------------------------------------------------------------------


def test_admin_can_create_an_ieee_day_edition(client, auth_headers):
    response = client.put(
        "/api/v1/admin/ieee-day/2026",
        headers=auth_headers,
        json={
            "year": 2026,
            "theme": "A Theme",
            "is_current": True,
            "stats": [{"label": "Participants", "value": "450"}],
            "highlights": [{"title": "Keynote", "description": "A talk."}],
            "gallery": [{"image": "/uploads/a.webp", "caption": "A photo"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["theme"] == "A Theme"
    assert len(body["stats"]) == 1
    assert len(body["highlights"]) == 1
    assert len(body["gallery"]) == 1


def test_ieee_day_edition_lists_its_tagged_events(client, auth_headers, db: Session):
    make_event(db, slug="ieee-day-talk", ieee_day_year=2026)
    make_event(db, slug="unrelated-event", ieee_day_year=None)
    client.put(
        "/api/v1/admin/ieee-day/2026", headers=auth_headers, json={"year": 2026, "is_current": True}
    )

    body = client.get("/api/v1/ieee-day/2026").json()

    assert [event["slug"] for event in body["events"]] == ["ieee-day-talk"]


def test_only_one_ieee_day_edition_stays_current(client, auth_headers):
    client.put(
        "/api/v1/admin/ieee-day/2025", headers=auth_headers, json={"year": 2025, "is_current": True}
    )
    client.put(
        "/api/v1/admin/ieee-day/2026", headers=auth_headers, json={"year": 2026, "is_current": True}
    )

    editions = client.get("/api/v1/ieee-day").json()

    current = [edition["year"] for edition in editions if edition["is_current"]]
    assert current == [2026]


def test_a_mismatched_year_is_refused(client, auth_headers):
    response = client.put("/api/v1/admin/ieee-day/2026", headers=auth_headers, json={"year": 2025})

    assert response.status_code == 404


def test_an_unknown_ieee_day_year_returns_404(client):
    assert client.get("/api/v1/ieee-day/1999").status_code == 404


# ---------------------------------------------------------------------------
# Submissions inbox and settings
# ---------------------------------------------------------------------------


def test_admin_can_view_contact_submissions(client, auth_headers):
    client.post(
        "/api/v1/contact",
        json={
            "name": "A Sender",
            "email": "sender@example.com",
            "message": "This message is definitely long enough to pass validation.",
        },
    )

    body = client.get("/api/v1/admin/submissions", headers=auth_headers).json()

    assert body["total"] == 1
    assert body["items"][0]["name"] == "A Sender"


def test_reading_a_submission_marks_it_as_seen(client, auth_headers):
    created = client.post(
        "/api/v1/contact",
        json={
            "name": "A Sender",
            "email": "sender@example.com",
            "message": "This message is definitely long enough to pass validation.",
        },
    ).json()

    before = client.get("/api/v1/admin/submissions/unread-count", headers=auth_headers).json()
    client.get(f"/api/v1/admin/submissions/{created['id']}", headers=auth_headers)
    after = client.get("/api/v1/admin/submissions/unread-count", headers=auth_headers).json()

    assert before["unread"] == 1
    assert after["unread"] == 0


def test_admin_can_triage_a_submission(client, auth_headers):
    created = client.post(
        "/api/v1/contact",
        json={
            "name": "A Sender",
            "email": "sender@example.com",
            "inquiry_type": "industry_collaboration",
            "message": "This message is definitely long enough to pass validation.",
        },
    ).json()

    response = client.patch(
        f"/api/v1/admin/submissions/{created['id']}",
        headers=auth_headers,
        json={"status": "replied", "admin_notes": "Answered by email."},
    )

    assert response.status_code == 200
    assert response.json()["status"] == SubmissionStatus.REPLIED.value
    assert response.json()["admin_notes"] == "Answered by email."


def test_admin_can_update_site_settings_and_they_become_public(client, auth_headers):
    response = client.put(
        "/api/v1/admin/settings",
        headers=auth_headers,
        json={"values": {"hero_heading": "A new heading"}},
    )

    assert response.status_code == 200
    assert client.get("/api/v1/settings").json()["hero_heading"] == "A new heading"


def test_updating_settings_leaves_other_keys_alone(client, auth_headers):
    client.put("/api/v1/admin/settings", headers=auth_headers, json={"values": {"keep": "this"}})
    client.put("/api/v1/admin/settings", headers=auth_headers, json={"values": {"add": "that"}})

    public = client.get("/api/v1/settings").json()
    assert public["keep"] == "this"
    assert public["add"] == "that"
