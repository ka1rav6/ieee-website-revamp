"""Request and response schemas for every content entity.

Each entity has a `*Public` read schema (only what the site should expose), a
`*Create` write schema and a `*Update` schema whose fields are all optional
for PATCH semantics.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, HttpUrl, field_validator

from app.models.content import InquiryType, SubmissionStatus, TeamCategory
from app.schemas.common import ORMModel

# Media paths may be site-relative ("/uploads/x.png") or absolute URLs, so
# they are plain strings with a length cap rather than HttpUrl.
MediaPath = str


def _blank_to_none(value: str | None) -> str | None:
    """Treat an empty form field as absent, so it clears the column."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


# ---------------------------------------------------------------------------
# Blogs
# ---------------------------------------------------------------------------


class BlogCategoryPublic(ORMModel):
    slug: str
    name: str
    description: str | None = None
    post_count: int = 0


class BlogTagPublic(ORMModel):
    slug: str
    name: str


class BlogPostSummary(ORMModel):
    """A blog card in a listing: no body, so listings stay cheap."""

    slug: str
    title: str
    excerpt: str | None = None
    cover_image: MediaPath | None = None
    cover_image_alt: str | None = None
    author_name: str
    author_subtitle: str | None = None
    author_image: MediaPath | None = None
    category: BlogCategoryPublic | None = None
    tags: list[BlogTagPublic] = Field(default_factory=list)
    is_featured: bool = False
    published_at: date | None = None
    reading_minutes: int | None = None


class BlogPostPublic(BlogPostSummary):
    """A full post. `body_html` is pre-sanitised server-side."""

    body_html: str
    related: list[BlogPostSummary] = Field(default_factory=list)


class BlogPostAdmin(BlogPostSummary):
    """What the editor needs: raw Markdown and the publish flags."""

    id: int
    body: str
    is_published: bool
    category_slug: str | None = None
    created_at: datetime
    updated_at: datetime


class BlogPostCreate(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    body: str = Field(default="", max_length=200_000)
    slug: str | None = Field(default=None, max_length=220)
    excerpt: str | None = Field(default=None, max_length=600)
    cover_image: MediaPath | None = Field(default=None, max_length=500)
    cover_image_alt: str | None = Field(default=None, max_length=300)
    author_name: str = Field(min_length=1, max_length=160)
    author_subtitle: str | None = Field(default=None, max_length=160)
    author_image: MediaPath | None = Field(default=None, max_length=500)
    category_slug: str | None = Field(default=None, max_length=120)
    tags: list[str] = Field(default_factory=list, max_length=20)
    is_published: bool = False
    is_featured: bool = False
    published_at: date | None = None

    _clean = field_validator(
        "slug",
        "excerpt",
        "cover_image",
        "cover_image_alt",
        "author_subtitle",
        "author_image",
        "category_slug",
        mode="after",
    )(_blank_to_none)


class BlogPostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    body: str | None = Field(default=None, max_length=200_000)
    slug: str | None = Field(default=None, max_length=220)
    excerpt: str | None = Field(default=None, max_length=600)
    cover_image: MediaPath | None = Field(default=None, max_length=500)
    cover_image_alt: str | None = Field(default=None, max_length=300)
    author_name: str | None = Field(default=None, min_length=1, max_length=160)
    author_subtitle: str | None = Field(default=None, max_length=160)
    author_image: MediaPath | None = Field(default=None, max_length=500)
    category_slug: str | None = Field(default=None, max_length=120)
    tags: list[str] | None = Field(default=None, max_length=20)
    is_published: bool | None = None
    is_featured: bool | None = None
    published_at: date | None = None


class BlogCategoryWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    sort_order: int = 0


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------


class TeamMemberPublic(ORMModel):
    slug: str
    name: str
    position: str | None = None
    category: TeamCategory
    photo: MediaPath | None = None
    department: str | None = None
    year: str | None = None
    bio: str | None = None
    email: EmailStr | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    website_url: str | None = None
    term: str | None = None
    sort_order: int = 0


class TeamMemberAdmin(TeamMemberPublic):
    id: int
    is_active: bool


class TeamMemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: TeamCategory
    slug: str | None = Field(default=None, max_length=160)
    position: str | None = Field(default=None, max_length=160)
    photo: MediaPath | None = Field(default=None, max_length=500)
    department: str | None = Field(default=None, max_length=160)
    year: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=2000)
    email: EmailStr | None = None
    linkedin_url: HttpUrl | None = None
    github_url: HttpUrl | None = None
    website_url: HttpUrl | None = None
    term: str | None = Field(default=None, max_length=40)
    sort_order: int = 0
    is_active: bool = True


class TeamMemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    category: TeamCategory | None = None
    slug: str | None = Field(default=None, max_length=160)
    position: str | None = Field(default=None, max_length=160)
    photo: MediaPath | None = Field(default=None, max_length=500)
    department: str | None = Field(default=None, max_length=160)
    year: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=2000)
    email: EmailStr | None = None
    linkedin_url: HttpUrl | None = None
    github_url: HttpUrl | None = None
    website_url: HttpUrl | None = None
    term: str | None = Field(default=None, max_length=40)
    sort_order: int | None = None
    is_active: bool | None = None


class ReorderRequest(BaseModel):
    """New ordering for a listing, as ids in the order they should appear."""

    ids: list[int] = Field(min_length=1, max_length=500)


# ---------------------------------------------------------------------------
# Alumni
# ---------------------------------------------------------------------------


class AlumnusPublic(ORMModel):
    slug: str
    name: str
    photo: MediaPath | None = None
    graduation_year: int | None = None
    degree: str | None = None
    branch: str | None = None
    current_role: str | None = None
    current_organization: str | None = None
    ieee_position: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    website_url: str | None = None
    is_featured: bool = False
    sort_order: int = 0


class AlumnusAdmin(AlumnusPublic):
    id: int


class AlumnusCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=160)
    photo: MediaPath | None = Field(default=None, max_length=500)
    graduation_year: int | None = Field(default=None, ge=1990, le=2100)
    degree: str | None = Field(default=None, max_length=120)
    branch: str | None = Field(default=None, max_length=120)
    current_role: str | None = Field(default=None, max_length=200)
    current_organization: str | None = Field(default=None, max_length=200)
    ieee_position: str | None = Field(default=None, max_length=160)
    linkedin_url: HttpUrl | None = None
    github_url: HttpUrl | None = None
    website_url: HttpUrl | None = None
    is_featured: bool = False
    sort_order: int = 0


class AlumnusUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=160)
    photo: MediaPath | None = Field(default=None, max_length=500)
    graduation_year: int | None = Field(default=None, ge=1990, le=2100)
    degree: str | None = Field(default=None, max_length=120)
    branch: str | None = Field(default=None, max_length=120)
    current_role: str | None = Field(default=None, max_length=200)
    current_organization: str | None = Field(default=None, max_length=200)
    ieee_position: str | None = Field(default=None, max_length=160)
    linkedin_url: HttpUrl | None = None
    github_url: HttpUrl | None = None
    website_url: HttpUrl | None = None
    is_featured: bool | None = None
    sort_order: int | None = None


# ---------------------------------------------------------------------------
# Collaborations
# ---------------------------------------------------------------------------


class CollaborationPublic(ORMModel):
    slug: str
    name: str
    logo: MediaPath | None = None
    description: str | None = None
    collaboration_type: str | None = None
    year: int | None = None
    website_url: str | None = None
    is_featured: bool = False
    sort_order: int = 0


class CollaborationAdmin(CollaborationPublic):
    id: int


class CollaborationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=160)
    logo: MediaPath | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    collaboration_type: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1990, le=2100)
    website_url: HttpUrl | None = None
    is_featured: bool = False
    sort_order: int = 0


class CollaborationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=160)
    logo: MediaPath | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    collaboration_type: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1990, le=2100)
    website_url: HttpUrl | None = None
    is_featured: bool | None = None
    sort_order: int | None = None


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


class EventPublic(ORMModel):
    slug: str
    title: str
    description: str | None = None
    poster: MediaPath | None = None
    event_date: date | None = None
    location: str | None = None
    category: str | None = None
    registration_url: str | None = None
    ieee_day_year: int | None = None
    is_featured: bool = False


class EventAdmin(EventPublic):
    id: int
    is_published: bool
    sort_order: int


class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    slug: str | None = Field(default=None, max_length=220)
    description: str | None = Field(default=None, max_length=4000)
    poster: MediaPath | None = Field(default=None, max_length=500)
    event_date: date | None = None
    location: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=120)
    registration_url: HttpUrl | None = None
    ieee_day_year: int | None = Field(default=None, ge=2000, le=2100)
    is_featured: bool = False
    is_published: bool = True
    sort_order: int = 0


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=300)
    slug: str | None = Field(default=None, max_length=220)
    description: str | None = Field(default=None, max_length=4000)
    poster: MediaPath | None = Field(default=None, max_length=500)
    event_date: date | None = None
    location: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=120)
    registration_url: HttpUrl | None = None
    ieee_day_year: int | None = Field(default=None, ge=2000, le=2100)
    is_featured: bool | None = None
    is_published: bool | None = None
    sort_order: int | None = None


# ---------------------------------------------------------------------------
# IEEE Day
# ---------------------------------------------------------------------------


class IeeeDayHighlightPublic(ORMModel):
    title: str
    description: str | None = None
    image: MediaPath | None = None


class IeeeDayStatPublic(ORMModel):
    label: str
    value: str


class IeeeDayPhotoPublic(ORMModel):
    image: MediaPath
    caption: str | None = None


class IeeeDayEditionPublic(ORMModel):
    year: int
    theme: str | None = None
    tagline: str | None = None
    description: str | None = None
    celebrated_on: date | None = None
    hero_image: MediaPath | None = None
    is_current: bool = False
    highlights: list[IeeeDayHighlightPublic] = Field(default_factory=list)
    stats: list[IeeeDayStatPublic] = Field(default_factory=list)
    gallery: list[IeeeDayPhotoPublic] = Field(default_factory=list)
    events: list[EventPublic] = Field(default_factory=list)


class IeeeDayHighlightWrite(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    description: str | None = Field(default=None, max_length=2000)
    image: MediaPath | None = Field(default=None, max_length=500)


class IeeeDayStatWrite(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=60)


class IeeeDayPhotoWrite(BaseModel):
    image: MediaPath = Field(min_length=1, max_length=500)
    caption: str | None = Field(default=None, max_length=300)


class IeeeDayEditionWrite(BaseModel):
    year: int = Field(ge=2000, le=2100)
    theme: str | None = Field(default=None, max_length=300)
    tagline: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    celebrated_on: date | None = None
    hero_image: MediaPath | None = Field(default=None, max_length=500)
    is_current: bool = False
    highlights: list[IeeeDayHighlightWrite] = Field(default_factory=list, max_length=40)
    stats: list[IeeeDayStatWrite] = Field(default_factory=list, max_length=20)
    gallery: list[IeeeDayPhotoWrite] = Field(default_factory=list, max_length=100)


# ---------------------------------------------------------------------------
# Contact
# ---------------------------------------------------------------------------


class ContactSubmissionCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    organization: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    inquiry_type: InquiryType = InquiryType.GENERAL
    subject: str | None = Field(default=None, max_length=250)
    message: str = Field(min_length=20, max_length=5000)

    _clean = field_validator("organization", "phone", "subject", mode="after")(_blank_to_none)

    @field_validator("name", "message", mode="after")
    @classmethod
    def _not_only_whitespace(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("This field cannot be empty")
        return stripped

    @field_validator("phone", mode="after")
    @classmethod
    def _plausible_phone(cls, value: str | None) -> str | None:
        if value and not all(ch.isdigit() or ch in "+()- ." for ch in value):
            raise ValueError("Enter a valid phone number")
        return value


class ContactSubmissionPublic(ORMModel):
    """What the sender gets back: an acknowledgement, not their own data."""

    id: int
    created_at: datetime


class ContactSubmissionAdmin(ORMModel):
    id: int
    name: str
    email: EmailStr
    organization: str | None = None
    phone: str | None = None
    inquiry_type: InquiryType
    subject: str | None = None
    message: str
    status: SubmissionStatus
    admin_notes: str | None = None
    created_at: datetime


class ContactSubmissionUpdate(BaseModel):
    status: SubmissionStatus | None = None
    admin_notes: str | None = Field(default=None, max_length=4000)


# ---------------------------------------------------------------------------
# Site settings and aggregates
# ---------------------------------------------------------------------------


class SiteSettingsPublic(BaseModel):
    """Editable copy and links, as a flat key/value map."""

    values: dict[str, str]


class SiteSettingsUpdate(BaseModel):
    values: dict[str, str] = Field(max_length=200)


class SiteStats(BaseModel):
    """Counters shown on the landing page."""

    members: int
    events: int
    blog_posts: int
    collaborations: int
    alumni: int
    years_active: int


class LandingPage(BaseModel):
    """Everything the landing page renders, in one request.

    Composed server-side so the hero does not wait on six round trips.
    """

    stats: SiteStats
    featured_events: list[EventPublic]
    featured_posts: list[BlogPostSummary]
    featured_collaborations: list[CollaborationPublic]
    featured_alumni: list[AlumnusPublic]
    core_team: list[TeamMemberPublic]
    settings: dict[str, str]
    ieee_day: IeeeDayEditionPublic | None = None
