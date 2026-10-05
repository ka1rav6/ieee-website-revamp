"""Public endpoints, and what they must never expose."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models.content import SiteSetting, TeamCategory
from tests.factories import (
    make_alumnus,
    make_category,
    make_collaboration,
    make_event,
    make_member,
    make_post,
)


def test_health_reports_ok(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Blog visibility - the core requirement that drafts stay private
# ---------------------------------------------------------------------------


def test_public_user_can_list_published_blogs(client, db: Session):
    make_post(db, slug="published-post", title="Published Post", published=True)

    response = client.get("/api/v1/blogs")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["slug"] == "published-post"


def test_draft_blogs_are_absent_from_the_public_listing(client, db: Session):
    make_post(db, slug="live", title="Live", published=True)
    make_post(db, slug="draft", title="Draft", published=False)

    body = client.get("/api/v1/blogs").json()

    slugs = [item["slug"] for item in body["items"]]
    assert slugs == ["live"]
    assert body["total"] == 1


def test_a_draft_blog_is_not_readable_by_slug(client, db: Session):
    make_post(db, slug="secret-draft", published=False)

    response = client.get("/api/v1/blogs/secret-draft")

    assert response.status_code == 404


def test_an_unknown_blog_slug_returns_404(client):
    response = client.get("/api/v1/blogs/does-not-exist")

    assert response.status_code == 404
    assert "detail" in response.json()


def test_a_published_blog_exposes_rendered_html_not_raw_markdown(client, db: Session):
    make_post(db, slug="with-body", body="## A heading\n\nSome prose.")

    body = client.get("/api/v1/blogs/with-body").json()

    assert "<h2>A heading</h2>" in body["body_html"]
    assert "## A heading" not in body["body_html"]


def test_script_tags_in_a_post_body_are_stripped(client, db: Session):
    make_post(db, slug="xss", body="Hello <script>alert('xss')</script> there.")

    body = client.get("/api/v1/blogs/xss").json()

    assert "<script>" not in body["body_html"]
    assert "alert" not in body["body_html"]


def test_blogs_can_be_filtered_by_category(client, db: Session):
    category = make_category(db, slug="tech-affairs", name="Tech Affairs")
    make_post(db, slug="in-category", category=category)
    make_post(db, slug="no-category")

    body = client.get("/api/v1/blogs", params={"category": "tech-affairs"}).json()

    assert [item["slug"] for item in body["items"]] == ["in-category"]


def test_blogs_can_be_searched_by_title(client, db: Session):
    make_post(db, slug="semiconductors", title="Semiconductor Manufacturing")
    make_post(db, slug="networks", title="Network Protocols")

    body = client.get("/api/v1/blogs", params={"search": "semiconductor"}).json()

    assert [item["slug"] for item in body["items"]] == ["semiconductors"]


def test_blog_listing_paginates(client, db: Session):
    for index in range(5):
        make_post(db, slug=f"post-{index}", title=f"Post {index}")

    first = client.get("/api/v1/blogs", params={"page": 1, "per_page": 2}).json()
    second = client.get("/api/v1/blogs", params={"page": 2, "per_page": 2}).json()

    assert first["total"] == second["total"] == 5
    assert len(first["items"]) == len(second["items"]) == 2
    assert {i["slug"] for i in first["items"]}.isdisjoint({i["slug"] for i in second["items"]})


def test_posts_without_a_date_sort_after_dated_posts(client, db: Session):
    make_post(db, slug="undated", title="Undated", published_at=None)
    make_post(db, slug="dated", title="Dated", published_at=date(2020, 1, 1))

    body = client.get("/api/v1/blogs").json()

    assert [item["slug"] for item in body["items"]] == ["dated", "undated"]


def test_category_counts_exclude_drafts(client, db: Session):
    category = make_category(db)
    make_post(db, slug="live-post", category=category, published=True)
    make_post(db, slug="draft-post", category=category, published=False)

    categories = client.get("/api/v1/blogs/categories").json()

    assert categories[0]["post_count"] == 1


def test_related_posts_prefer_the_same_category(client, db: Session):
    category = make_category(db)
    make_post(db, slug="main", category=category)
    make_post(db, slug="sibling", category=category)
    make_post(db, slug="unrelated")

    body = client.get("/api/v1/blogs/main").json()

    related = [item["slug"] for item in body["related"]]
    assert "main" not in related
    assert related[0] == "sibling"


def test_reading_time_is_derived_when_absent(client, db: Session):
    make_post(db, slug="long-read", body="word " * 1000)

    body = client.get("/api/v1/blogs/long-read").json()

    assert body["reading_minutes"] >= 4


# ---------------------------------------------------------------------------
# Team, alumni, collaborations, events
# ---------------------------------------------------------------------------


def test_team_listing_returns_active_members(client, db: Session):
    make_member(db, slug="chair", name="Chair", category=TeamCategory.CORE)

    response = client.get("/api/v1/team")

    assert response.status_code == 200
    assert [member["slug"] for member in response.json()] == ["chair"]


def test_inactive_members_are_hidden_from_the_public_team_listing(client, db: Session):
    make_member(db, slug="current", name="Current", active=True)
    make_member(db, slug="former", name="Former", active=False)

    slugs = [member["slug"] for member in client.get("/api/v1/team").json()]

    assert slugs == ["current"]


def test_team_can_be_filtered_by_category(client, db: Session):
    make_member(db, slug="faculty-member", category=TeamCategory.FACULTY)
    make_member(db, slug="core-member", category=TeamCategory.CORE)

    response = client.get("/api/v1/team", params={"category": "faculty"})

    assert [member["slug"] for member in response.json()] == ["faculty-member"]


def test_alumni_listing_works(client, db: Session):
    make_alumnus(db, slug="an-alum", name="An Alum", year=2022)

    response = client.get("/api/v1/alumni")

    assert response.status_code == 200
    assert response.json()[0]["graduation_year"] == 2022


def test_alumni_can_be_filtered_by_graduation_year(client, db: Session):
    make_alumnus(db, slug="class-2022", name="Class 2022", year=2022)
    make_alumnus(db, slug="class-2023", name="Class 2023", year=2023)

    response = client.get("/api/v1/alumni", params={"year": 2023})

    assert [a["slug"] for a in response.json()] == ["class-2023"]


def test_collaborations_listing_works(client, db: Session):
    make_collaboration(db, slug="acme", name="Acme")

    response = client.get("/api/v1/collaborations")

    assert response.status_code == 200
    assert response.json()[0]["name"] == "Acme"


def test_unpublished_events_are_hidden(client, db: Session):
    make_event(db, slug="visible", published=True)
    make_event(db, slug="hidden", published=False)

    body = client.get("/api/v1/events").json()

    assert [event["slug"] for event in body["items"]] == ["visible"]


def test_events_can_be_filtered_to_past_only(client, db: Session):
    make_event(db, slug="old", event_date=date(2020, 1, 1))
    make_event(db, slug="future", event_date=date(2099, 1, 1))

    body = client.get("/api/v1/events", params={"upcoming": False}).json()

    assert [event["slug"] for event in body["items"]] == ["old"]


def test_upcoming_events_are_ordered_soonest_first(client, db: Session):
    make_event(db, slug="later", event_date=date(2099, 6, 1))
    make_event(db, slug="sooner", event_date=date(2099, 1, 1))

    body = client.get("/api/v1/events", params={"upcoming": True}).json()

    assert [event["slug"] for event in body["items"]] == ["sooner", "later"]


# ---------------------------------------------------------------------------
# Aggregates and SEO
# ---------------------------------------------------------------------------


def test_landing_page_composes_every_section(client, db: Session):
    make_member(db, slug="chair", category=TeamCategory.CORE)
    make_post(db, slug="featured", featured=True)
    make_event(db, slug="event")
    make_collaboration(db)
    make_alumnus(db)

    body = client.get("/api/v1/landing").json()

    assert body["stats"]["members"] == 1
    assert body["stats"]["blog_posts"] == 1
    assert [p["slug"] for p in body["featured_posts"]] == ["featured"]
    assert [e["slug"] for e in body["featured_events"]] == ["event"]
    assert len(body["core_team"]) == 1
    assert len(body["featured_collaborations"]) == 1
    assert len(body["featured_alumni"]) == 1


def test_landing_page_omits_drafts_from_featured_posts(client, db: Session):
    make_post(db, slug="draft-featured", published=False, featured=True)

    body = client.get("/api/v1/landing").json()

    assert body["featured_posts"] == []


def test_settings_are_exposed_as_a_flat_map(client, db: Session):
    db.add(SiteSetting(key="site_name", value="IEEE IIIT Delhi"))
    db.commit()

    response = client.get("/api/v1/settings")

    assert response.json()["site_name"] == "IEEE IIIT Delhi"


def test_robots_txt_disallows_admin_and_api(client):
    body = client.get("/robots.txt").text

    assert "Disallow: /admin" in body
    assert "Disallow: /api/" in body
    assert "Sitemap:" in body


def test_sitemap_lists_published_posts_only(client, db: Session):
    make_post(db, slug="in-sitemap", published=True)
    make_post(db, slug="not-in-sitemap", published=False)

    body = client.get("/sitemap.xml").text

    assert "/blogs/in-sitemap" in body
    assert "/blogs/not-in-sitemap" not in body


def test_security_headers_are_present(client):
    headers = client.get("/api/v1/health").headers

    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert "Referrer-Policy" in headers
