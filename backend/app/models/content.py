"""Database models for every piece of editable site content.

Public content is addressed by `slug` so URLs stay stable and SEO-friendly
even when titles are reworded. Ordering across listings is explicit
(`sort_order`) rather than implied by insertion order, because the admin
needs to rearrange cards without recreating rows.
"""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class TeamCategory(enum.StrEnum):
    """Groupings used on /team, mirroring how the branch actually organises.

    Values are stable identifiers used by the API and content files; display
    names live in the frontend so they can be reworded without a migration.
    """

    FACULTY = "faculty"
    CORE = "core"
    EXECUTIVE = "executive"
    MENTOR = "mentor"


class InquiryType(enum.StrEnum):
    """What a contact submission is about, chosen by the sender."""

    GENERAL = "general"
    MEMBERSHIP = "membership"
    INDUSTRY_COLLABORATION = "industry_collaboration"
    EVENT_SPONSORSHIP = "event_sponsorship"
    WORKSHOP = "workshop"
    TALK = "talk"
    RESEARCH = "research"
    OTHER = "other"


class SubmissionStatus(enum.StrEnum):
    """Admin triage state for a contact submission."""

    NEW = "new"
    READ = "read"
    REPLIED = "replied"
    ARCHIVED = "archived"


def _enum_column(enum_type: type[enum.Enum], name: str) -> Enum:
    """A Postgres enum that stores the member *values*, not their names.

    SQLAlchemy defaults to persisting `.name` (e.g. "CORE"), which would make
    stored rows disagree with the lowercase identifiers used by the API and
    the content files. Storing values keeps all three readable and identical.
    """
    return Enum(
        enum_type,
        name=name,
        values_callable=lambda members: [member.value for member in members],
    )


class Admin(Base, TimestampMixin):
    """The single administrator account.

    Deliberately not a general user table: the site has exactly one admin and
    no role model. `password_hash` is argon2 and never leaves the server.
    """

    __tablename__ = "admin"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bumped on password change so previously issued tokens stop validating.
    token_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


blog_post_tags = Table(
    "blog_post_tags",
    Base.metadata,
    Column("post_id", ForeignKey("blog_posts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("blog_tags.id", ondelete="CASCADE"), primary_key=True),
)


class BlogCategory(Base, TimestampMixin):
    """A blog section such as "Tech Affairs". Every post belongs to one."""

    __tablename__ = "blog_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    posts: Mapped[list[BlogPost]] = relationship(back_populates="category")


class BlogTag(Base, TimestampMixin):
    """A free-form keyword. Posts may carry several."""

    __tablename__ = "blog_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)

    posts: Mapped[list[BlogPost]] = relationship(secondary=blog_post_tags, back_populates="tags")


class BlogPost(Base, TimestampMixin):
    """A blog article.

    `is_published` is the only thing that makes a post publicly readable;
    public queries filter on it so a draft can never leak through the API.
    `published_at` is nullable because historical posts imported from the
    previous site carry no date.
    """

    __tablename__ = "blog_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(220), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    excerpt: Mapped[str | None] = mapped_column(Text)
    # Markdown. Rendered to sanitised HTML by the API, never by the browser.
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    cover_image: Mapped[str | None] = mapped_column(String(500))
    cover_image_alt: Mapped[str | None] = mapped_column(String(300))

    author_name: Mapped[str] = mapped_column(String(160), nullable=False)
    author_subtitle: Mapped[str | None] = mapped_column(String(160))
    author_image: Mapped[str | None] = mapped_column(String(500))

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("blog_categories.id", ondelete="SET NULL"), index=True
    )
    category: Mapped[BlogCategory | None] = relationship(back_populates="posts")
    tags: Mapped[list[BlogTag]] = relationship(
        secondary=blog_post_tags, back_populates="posts", order_by="BlogTag.name"
    )

    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[date | None] = mapped_column(Date)
    reading_minutes: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (
        # The public listing is always "published, newest first".
        Index("ix_blog_posts_published", "is_published", "published_at"),
    )


class TeamMember(Base, TimestampMixin):
    """A person on /team, in one of the `TeamCategory` groups."""

    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    position: Mapped[str | None] = mapped_column(String(160))
    category: Mapped[TeamCategory] = mapped_column(
        _enum_column(TeamCategory, "team_category"), nullable=False, index=True
    )
    photo: Mapped[str | None] = mapped_column(String(500))
    department: Mapped[str | None] = mapped_column(String(160))
    year: Mapped[str | None] = mapped_column(String(40))
    bio: Mapped[str | None] = mapped_column(Text)

    email: Mapped[str | None] = mapped_column(String(255))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    github_url: Mapped[str | None] = mapped_column(String(500))
    website_url: Mapped[str | None] = mapped_column(String(500))

    # Which academic session this roster entry belongs to, e.g. "2025-26".
    term: Mapped[str | None] = mapped_column(String(40), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Alumnus(Base, TimestampMixin):
    """A former member.

    Only fields the branch publishes are stored; there is no phone number or
    personal address column, so private data cannot be exposed by accident.
    """

    __tablename__ = "alumni"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    photo: Mapped[str | None] = mapped_column(String(500))
    graduation_year: Mapped[int | None] = mapped_column(Integer, index=True)
    degree: Mapped[str | None] = mapped_column(String(120))
    branch: Mapped[str | None] = mapped_column(String(120))
    current_role: Mapped[str | None] = mapped_column(String(200))
    current_organization: Mapped[str | None] = mapped_column(String(200))
    ieee_position: Mapped[str | None] = mapped_column(String(160))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    github_url: Mapped[str | None] = mapped_column(String(500))
    website_url: Mapped[str | None] = mapped_column(String(500))
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Collaboration(Base, TimestampMixin):
    """An organisation the branch has worked with."""

    __tablename__ = "collaborations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    logo: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    collaboration_type: Mapped[str | None] = mapped_column(String(120))
    year: Mapped[int | None] = mapped_column(Integer, index=True)
    website_url: Mapped[str | None] = mapped_column(String(500))
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Event(Base, TimestampMixin):
    """A branch event: workshop, talk, competition or hackathon."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(220), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    poster: Mapped[str | None] = mapped_column(String(500))
    event_date: Mapped[date | None] = mapped_column(Date, index=True)
    location: Mapped[str | None] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(120))
    registration_url: Mapped[str | None] = mapped_column(String(500))
    # Marks the event as part of an IEEE Day edition, e.g. 2025.
    ieee_day_year: Mapped[int | None] = mapped_column(Integer, index=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class IeeeDayEdition(Base, TimestampMixin):
    """One year's IEEE Day celebration, with its theme and highlights."""

    __tablename__ = "ieee_day_editions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)
    theme: Mapped[str | None] = mapped_column(String(300))
    tagline: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    celebrated_on: Mapped[date | None] = mapped_column(Date)
    hero_image: Mapped[str | None] = mapped_column(String(500))
    # The current edition shown at the top of /ieee-day.
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    highlights: Mapped[list[IeeeDayHighlight]] = relationship(
        back_populates="edition",
        cascade="all, delete-orphan",
        order_by="IeeeDayHighlight.sort_order",
    )
    stats: Mapped[list[IeeeDayStat]] = relationship(
        back_populates="edition",
        cascade="all, delete-orphan",
        order_by="IeeeDayStat.sort_order",
    )
    gallery: Mapped[list[IeeeDayPhoto]] = relationship(
        back_populates="edition",
        cascade="all, delete-orphan",
        order_by="IeeeDayPhoto.sort_order",
    )


class IeeeDayHighlight(Base, TimestampMixin):
    """A notable moment from an IEEE Day edition."""

    __tablename__ = "ieee_day_highlights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("ieee_day_editions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    edition: Mapped[IeeeDayEdition] = relationship(back_populates="highlights")
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class IeeeDayStat(Base, TimestampMixin):
    """A headline number, e.g. "450 participants"."""

    __tablename__ = "ieee_day_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("ieee_day_editions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    edition: Mapped[IeeeDayEdition] = relationship(back_populates="stats")
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str] = mapped_column(String(60), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (UniqueConstraint("edition_id", "label", name="uq_ieee_day_stat_label"),)


class IeeeDayPhoto(Base, TimestampMixin):
    """A gallery image for an IEEE Day edition."""

    __tablename__ = "ieee_day_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("ieee_day_editions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    edition: Mapped[IeeeDayEdition] = relationship(back_populates="gallery")
    image: Mapped[str] = mapped_column(String(500), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class ContactSubmission(Base, TimestampMixin):
    """A message from the contact / collaborate form.

    Stored first and notified second, so a mail outage can never lose an
    enquiry. Visible only through the authenticated admin API.
    """

    __tablename__ = "contact_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    organization: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(40))
    inquiry_type: Mapped[InquiryType] = mapped_column(
        _enum_column(InquiryType, "inquiry_type"), nullable=False, index=True
    )
    subject: Mapped[str | None] = mapped_column(String(250))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SubmissionStatus] = mapped_column(
        _enum_column(SubmissionStatus, "submission_status"),
        default=SubmissionStatus.NEW,
        nullable=False,
        index=True,
    )
    admin_notes: Mapped[str | None] = mapped_column(Text)
    # Kept for abuse investigation and rate limiting only.
    source_ip: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (Index("ix_contact_submissions_triage", "status", "created_at"),)


class SiteSetting(Base, TimestampMixin):
    """Small editable strings that are not worth their own table.

    Used for page intros, the join-form URL, social links and similar, so the
    admin can change copy without a developer touching React.
    """

    __tablename__ = "site_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
