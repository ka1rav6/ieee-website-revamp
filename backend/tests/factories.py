"""Helpers for building content rows in tests."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models.content import (
    Alumnus,
    BlogCategory,
    BlogPost,
    Collaboration,
    Event,
    TeamCategory,
    TeamMember,
)


def make_category(
    db: Session, *, slug: str = "tech-affairs", name: str = "Tech Affairs"
) -> BlogCategory:
    category = BlogCategory(slug=slug, name=name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def make_post(
    db: Session,
    *,
    slug: str = "a-post",
    title: str = "A Post",
    published: bool = True,
    featured: bool = False,
    body: str = "Some body text about engineering.",
    published_at: date | None = date(2026, 1, 15),
    category: BlogCategory | None = None,
    author: str = "Test Author",
) -> BlogPost:
    post = BlogPost(
        slug=slug,
        title=title,
        body=body,
        excerpt="An excerpt.",
        author_name=author,
        is_published=published,
        is_featured=featured,
        published_at=published_at,
        category=category,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def make_member(
    db: Session,
    *,
    slug: str = "a-member",
    name: str = "A Member",
    category: TeamCategory = TeamCategory.CORE,
    position: str = "Chairperson",
    active: bool = True,
) -> TeamMember:
    member = TeamMember(
        slug=slug, name=name, category=category, position=position, is_active=active
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def make_alumnus(
    db: Session, *, slug: str = "an-alum", name: str = "An Alum", year: int = 2023
) -> Alumnus:
    alumnus = Alumnus(slug=slug, name=name, graduation_year=year, current_organization="Acme")
    db.add(alumnus)
    db.commit()
    db.refresh(alumnus)
    return alumnus


def make_collaboration(db: Session, *, slug: str = "acme", name: str = "Acme") -> Collaboration:
    collaboration = Collaboration(slug=slug, name=name, year=2024)
    db.add(collaboration)
    db.commit()
    db.refresh(collaboration)
    return collaboration


def make_event(
    db: Session,
    *,
    slug: str = "an-event",
    title: str = "An Event",
    event_date: date | None = date(2026, 3, 1),
    published: bool = True,
    ieee_day_year: int | None = None,
) -> Event:
    event = Event(
        slug=slug,
        title=title,
        event_date=event_date,
        is_published=published,
        ieee_day_year=ieee_day_year,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
