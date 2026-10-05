"""Schemas for the files under `content/`.

These are deliberately separate from the API schemas: content files are
hand-edited by people, so they accept looser input (dates as plain strings,
omitted slugs, optional ordering) and are forgiving about field order. The
importer is what turns them into validated database rows.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.content import TeamCategory

# `date` is also a field name in these models, which would shadow the type in
# the class namespace, so annotations use this alias instead.
type DateValue = date

# Date formats accepted in content files, in the order they are tried.
# The first is ISO; the rest match how the previous site wrote dates.
DATE_FORMATS = ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%d/%m/%Y")


def parse_content_date(value: object) -> date | None:
    """Parse a date written the way a person would write it."""
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not isinstance(value, str):
        raise ValueError(f"Cannot read {value!r} as a date")

    text = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot read {value!r} as a date. Use YYYY-MM-DD, e.g. 2026-03-27.")


class ContentModel(BaseModel):
    """Base that rejects unknown keys.

    A typo like `positon:` should be an error the author sees immediately,
    not a field silently dropped on import.
    """

    model_config = ConfigDict(extra="forbid")


class TeamMemberFile(ContentModel):
    name: str = Field(min_length=1, max_length=160)
    category: TeamCategory
    slug: str | None = Field(default=None, max_length=160)
    position: str | None = Field(default=None, max_length=160)
    photo: str | None = Field(default=None, max_length=500)
    department: str | None = Field(default=None, max_length=160)
    year: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=2000)
    email: str | None = Field(default=None, max_length=255)
    linkedin_url: str | None = Field(default=None, max_length=500)
    github_url: str | None = Field(default=None, max_length=500)
    website_url: str | None = Field(default=None, max_length=500)
    term: str | None = Field(default=None, max_length=40)
    is_active: bool = True


class AlumnusFile(ContentModel):
    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=160)
    photo: str | None = Field(default=None, max_length=500)
    graduation_year: int | None = Field(default=None, ge=1990, le=2100)
    degree: str | None = Field(default=None, max_length=120)
    branch: str | None = Field(default=None, max_length=120)
    current_role: str | None = Field(default=None, max_length=200)
    current_organization: str | None = Field(default=None, max_length=200)
    ieee_position: str | None = Field(default=None, max_length=160)
    linkedin_url: str | None = Field(default=None, max_length=500)
    github_url: str | None = Field(default=None, max_length=500)
    website_url: str | None = Field(default=None, max_length=500)
    is_featured: bool = False


class CollaborationFile(ContentModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=160)
    logo: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    collaboration_type: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1990, le=2100)
    website_url: str | None = Field(default=None, max_length=500)
    is_featured: bool = False


class EventFile(ContentModel):
    title: str = Field(min_length=1, max_length=300)
    slug: str | None = Field(default=None, max_length=220)
    description: str | None = Field(default=None, max_length=4000)
    poster: str | None = Field(default=None, max_length=500)
    date: DateValue | None = None
    location: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=120)
    registration_url: str | None = Field(default=None, max_length=500)
    ieee_day_year: int | None = Field(default=None, ge=2000, le=2100)
    is_featured: bool = False
    is_published: bool = True

    _parse_date = field_validator("date", mode="before")(parse_content_date)


class BlogCategoryFile(ContentModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class BlogPostFile(ContentModel):
    """A post's frontmatter. The Markdown body lives below the `---` fence."""

    title: str = Field(min_length=1, max_length=300)
    slug: str | None = Field(default=None, max_length=220)
    author: str = Field(min_length=1, max_length=160)
    author_subtitle: str | None = Field(default=None, max_length=160)
    author_image: str | None = Field(default=None, max_length=500)
    category: str | None = Field(default=None, max_length=120)
    tags: list[str] = Field(default_factory=list, max_length=20)
    excerpt: str | None = Field(default=None, max_length=600)
    cover_image: str | None = Field(default=None, max_length=500)
    cover_image_alt: str | None = Field(default=None, max_length=300)
    date: DateValue | None = None
    published: bool = True
    featured: bool = False

    _parse_date = field_validator("date", mode="before")(parse_content_date)


class IeeeDayHighlightFile(ContentModel):
    title: str = Field(min_length=1, max_length=250)
    description: str | None = Field(default=None, max_length=2000)
    image: str | None = Field(default=None, max_length=500)


class IeeeDayStatFile(ContentModel):
    label: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=60)


class IeeeDayPhotoFile(ContentModel):
    image: str = Field(min_length=1, max_length=500)
    caption: str | None = Field(default=None, max_length=300)


class IeeeDayEditionFile(ContentModel):
    year: int = Field(ge=2000, le=2100)
    theme: str | None = Field(default=None, max_length=300)
    tagline: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    celebrated_on: DateValue | None = None
    hero_image: str | None = Field(default=None, max_length=500)
    is_current: bool = False
    highlights: list[IeeeDayHighlightFile] = Field(default_factory=list)
    stats: list[IeeeDayStatFile] = Field(default_factory=list)
    gallery: list[IeeeDayPhotoFile] = Field(default_factory=list)

    _parse_date = field_validator("celebrated_on", mode="before")(parse_content_date)

    @field_validator("stats", mode="after")
    @classmethod
    def _unique_labels(cls, stats: list[IeeeDayStatFile]) -> list[IeeeDayStatFile]:
        labels = [stat.label for stat in stats]
        duplicates = {label for label in labels if labels.count(label) > 1}
        if duplicates:
            raise ValueError(f"Duplicate stat labels: {sorted(duplicates)}")
        return stats
