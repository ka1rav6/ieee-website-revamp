"""Public read-only endpoints.

Everything here is unauthenticated and must expose only published,
publication-intended data.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession
from app.core.errors import NotFoundError
from app.models.content import (
    Alumnus,
    BlogCategory,
    BlogPost,
    BlogTag,
    Collaboration,
    Event,
    IeeeDayEdition,
    SiteSetting,
    TeamCategory,
    TeamMember,
)
from app.schemas.common import Page
from app.schemas.content import (
    AlumnusPublic,
    BlogCategoryPublic,
    BlogPostPublic,
    BlogPostSummary,
    BlogTagPublic,
    CollaborationPublic,
    EventPublic,
    IeeeDayEditionPublic,
    LandingPage,
    SiteStats,
    TeamMemberPublic,
)
from app.services import blogs as blog_service

router = APIRouter(tags=["public"])

# The branch was founded in 2019; used for the "years active" counter.
FOUNDING_YEAR = 2019

# How many of each kind of card the landing page shows.
LANDING_EVENTS = 3
LANDING_POSTS = 3
LANDING_COLLABORATIONS = 12
LANDING_ALUMNI = 8


@router.get("/health", summary="Liveness probe")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _settings_map(db: DbSession) -> dict[str, str]:
    return {row.key: row.value for row in db.scalars(select(SiteSetting))}


@router.get("/settings", response_model=dict[str, str])
def read_settings(db: DbSession) -> dict[str, str]:
    """Editable copy and links, so the admin can reword the site."""
    return _settings_map(db)


def _site_stats(db: DbSession) -> SiteStats:
    members = db.scalar(
        select(func.count()).select_from(TeamMember).where(TeamMember.is_active.is_(True))
    )
    events = db.scalar(select(func.count()).select_from(Event).where(Event.is_published.is_(True)))
    posts = db.scalar(
        select(func.count()).select_from(BlogPost).where(BlogPost.is_published.is_(True))
    )
    collaborations = db.scalar(select(func.count()).select_from(Collaboration))
    alumni = db.scalar(select(func.count()).select_from(Alumnus))
    return SiteStats(
        members=members or 0,
        events=events or 0,
        blog_posts=posts or 0,
        collaborations=collaborations or 0,
        alumni=alumni or 0,
        years_active=max(1, date.today().year - FOUNDING_YEAR),
    )


@router.get("/stats", response_model=SiteStats)
def read_stats(db: DbSession) -> SiteStats:
    return _site_stats(db)


@router.get("/landing", response_model=LandingPage)
def read_landing(db: DbSession) -> LandingPage:
    """Everything the landing page needs, in a single request."""
    featured_events = db.scalars(
        select(Event)
        .where(Event.is_published.is_(True))
        .order_by(
            Event.is_featured.desc(),
            Event.event_date.desc().nulls_last(),
            Event.id.desc(),
        )
        .limit(LANDING_EVENTS)
    ).all()

    featured_posts = db.scalars(
        blog_service.published_posts()
        .order_by(None)
        .order_by(
            BlogPost.is_featured.desc(),
            BlogPost.published_at.desc().nulls_last(),
            BlogPost.id.desc(),
        )
        .limit(LANDING_POSTS)
    ).all()

    collaborations = db.scalars(
        select(Collaboration)
        .order_by(
            Collaboration.is_featured.desc(),
            Collaboration.sort_order,
            Collaboration.name,
        )
        .limit(LANDING_COLLABORATIONS)
    ).all()

    alumni = db.scalars(
        select(Alumnus)
        .order_by(Alumnus.is_featured.desc(), Alumnus.sort_order, Alumnus.name)
        .limit(LANDING_ALUMNI)
    ).all()

    core_team = db.scalars(
        select(TeamMember)
        .where(TeamMember.is_active.is_(True), TeamMember.category == TeamCategory.CORE)
        .order_by(TeamMember.sort_order, TeamMember.name)
    ).all()

    current_ieee_day = db.scalar(
        select(IeeeDayEdition)
        .options(
            selectinload(IeeeDayEdition.highlights),
            selectinload(IeeeDayEdition.stats),
            selectinload(IeeeDayEdition.gallery),
        )
        .order_by(IeeeDayEdition.is_current.desc(), IeeeDayEdition.year.desc())
        .limit(1)
    )

    return LandingPage(
        stats=_site_stats(db),
        featured_events=[
            EventPublic.model_validate(e, from_attributes=True) for e in featured_events
        ],
        featured_posts=[blog_service.to_summary(p) for p in featured_posts],
        featured_collaborations=[
            CollaborationPublic.model_validate(c, from_attributes=True) for c in collaborations
        ],
        featured_alumni=[AlumnusPublic.model_validate(a, from_attributes=True) for a in alumni],
        core_team=[TeamMemberPublic.model_validate(m, from_attributes=True) for m in core_team],
        settings=_settings_map(db),
        ieee_day=_serialise_edition(db, current_ieee_day) if current_ieee_day else None,
    )


# ---------------------------------------------------------------------------
# Blogs
# ---------------------------------------------------------------------------


@router.get("/blogs/categories", response_model=list[BlogCategoryPublic])
def list_blog_categories(db: DbSession) -> list[BlogCategoryPublic]:
    """Categories with a count of their published posts."""
    published = BlogPost.is_published.is_(True)
    rows = db.execute(
        select(BlogCategory, func.count(BlogPost.id))
        .outerjoin(BlogPost, (BlogPost.category_id == BlogCategory.id) & published)
        .group_by(BlogCategory.id)
        .order_by(BlogCategory.sort_order, BlogCategory.name)
    ).all()
    return [
        BlogCategoryPublic(
            slug=category.slug,
            name=category.name,
            description=category.description,
            post_count=count,
        )
        for category, count in rows
    ]


@router.get("/blogs/tags", response_model=list[BlogTagPublic])
def list_blog_tags(db: DbSession) -> list[BlogTagPublic]:
    """Tags that at least one published post carries."""
    tags = db.scalars(
        select(BlogTag)
        .join(BlogTag.posts)
        .where(BlogPost.is_published.is_(True))
        .distinct()
        .order_by(BlogTag.name)
    ).all()
    return [BlogTagPublic.model_validate(t, from_attributes=True) for t in tags]


@router.get("/blogs", response_model=Page[BlogPostSummary])
def list_blogs(
    db: DbSession,
    page: int = Query(1, ge=1),
    per_page: int = Query(9, ge=1, le=50),
    category: str | None = Query(None, max_length=120),
    tag: str | None = Query(None, max_length=80),
    search: str | None = Query(None, max_length=200),
    featured: bool | None = None,
) -> Page[BlogPostSummary]:
    query = blog_service.apply_filters(
        blog_service.published_posts(),
        category=category,
        tag=tag,
        search=search,
        featured=featured,
    )
    total = blog_service.count_posts(db, query)
    posts = db.scalars(query.offset((page - 1) * per_page).limit(per_page)).all()
    return Page(
        items=[blog_service.to_summary(p) for p in posts],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/blogs/{slug}", response_model=BlogPostPublic)
def read_blog(slug: str, db: DbSession) -> BlogPostPublic:
    """A single published post.

    An unpublished slug returns 404 rather than 403, so the existence of a
    draft is not disclosed.
    """
    post = db.scalar(blog_service.published_posts().where(BlogPost.slug == slug))
    if post is None:
        raise NotFoundError("That article does not exist.")
    return blog_service.to_public(db, post)


# ---------------------------------------------------------------------------
# Team, alumni, collaborations, events
# ---------------------------------------------------------------------------


@router.get("/team", response_model=list[TeamMemberPublic])
def list_team(
    db: DbSession,
    category: TeamCategory | None = None,
    term: str | None = Query(None, max_length=40),
) -> list[TeamMemberPublic]:
    query = select(TeamMember).where(TeamMember.is_active.is_(True))
    if category is not None:
        query = query.where(TeamMember.category == category)
    if term:
        query = query.where(TeamMember.term == term)
    members = db.scalars(query.order_by(TeamMember.sort_order, TeamMember.name)).all()
    return [TeamMemberPublic.model_validate(m, from_attributes=True) for m in members]


@router.get("/alumni", response_model=list[AlumnusPublic])
def list_alumni(
    db: DbSession,
    year: int | None = Query(None, ge=1990, le=2100),
    search: str | None = Query(None, max_length=200),
) -> list[AlumnusPublic]:
    query = select(Alumnus)
    if year is not None:
        query = query.where(Alumnus.graduation_year == year)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            Alumnus.name.ilike(pattern)
            | Alumnus.current_organization.ilike(pattern)
            | Alumnus.current_role.ilike(pattern)
        )
    alumni = db.scalars(
        query.order_by(
            Alumnus.is_featured.desc(),
            Alumnus.sort_order,
            Alumnus.graduation_year.desc().nulls_last(),
            Alumnus.name,
        )
    ).all()
    return [AlumnusPublic.model_validate(a, from_attributes=True) for a in alumni]


@router.get("/collaborations", response_model=list[CollaborationPublic])
def list_collaborations(
    db: DbSession,
    year: int | None = Query(None, ge=1990, le=2100),
) -> list[CollaborationPublic]:
    query = select(Collaboration)
    if year is not None:
        query = query.where(Collaboration.year == year)
    rows = db.scalars(
        query.order_by(
            Collaboration.is_featured.desc(),
            Collaboration.sort_order,
            Collaboration.name,
        )
    ).all()
    return [CollaborationPublic.model_validate(c, from_attributes=True) for c in rows]


@router.get("/events", response_model=Page[EventPublic])
def list_events(
    db: DbSession,
    page: int = Query(1, ge=1),
    per_page: int = Query(24, ge=1, le=100),
    upcoming: bool | None = Query(None, description="True for future events, False for past"),
    year: int | None = Query(None, ge=2000, le=2100),
    search: str | None = Query(None, max_length=200),
) -> Page[EventPublic]:
    query = select(Event).where(Event.is_published.is_(True))
    today = date.today()
    if upcoming is True:
        query = query.where(Event.event_date >= today)
    elif upcoming is False:
        query = query.where(Event.event_date < today)
    if year is not None:
        query = query.where(func.extract("year", Event.event_date) == year)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(Event.title.ilike(pattern) | Event.description.ilike(pattern))

    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    # Upcoming events read best soonest-first; everything else newest-first.
    order = Event.event_date.asc() if upcoming is True else Event.event_date.desc()
    events = db.scalars(
        query.order_by(order.nulls_last(), Event.sort_order, Event.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()
    return Page(
        items=[EventPublic.model_validate(e, from_attributes=True) for e in events],
        total=total,
        page=page,
        per_page=per_page,
    )


# ---------------------------------------------------------------------------
# IEEE Day
# ---------------------------------------------------------------------------


def _serialise_edition(db: DbSession, edition: IeeeDayEdition) -> IeeeDayEditionPublic:
    """Attach the events tagged with this edition's year."""
    events = db.scalars(
        select(Event)
        .where(Event.is_published.is_(True), Event.ieee_day_year == edition.year)
        .order_by(Event.sort_order, Event.event_date.desc().nulls_last())
    ).all()
    public = IeeeDayEditionPublic.model_validate(edition, from_attributes=True)
    public.events = [EventPublic.model_validate(e, from_attributes=True) for e in events]
    return public


def _edition_query():
    return select(IeeeDayEdition).options(
        selectinload(IeeeDayEdition.highlights),
        selectinload(IeeeDayEdition.stats),
        selectinload(IeeeDayEdition.gallery),
    )


@router.get("/ieee-day", response_model=list[IeeeDayEditionPublic])
def list_ieee_day_editions(db: DbSession) -> list[IeeeDayEditionPublic]:
    """Every IEEE Day edition, current first then newest."""
    editions = db.scalars(
        _edition_query().order_by(IeeeDayEdition.is_current.desc(), IeeeDayEdition.year.desc())
    ).all()
    return [_serialise_edition(db, edition) for edition in editions]


@router.get("/ieee-day/{year}", response_model=IeeeDayEditionPublic)
def read_ieee_day_edition(year: int, db: DbSession) -> IeeeDayEditionPublic:
    edition = db.scalar(_edition_query().where(IeeeDayEdition.year == year))
    if edition is None:
        raise NotFoundError(f"No IEEE Day edition recorded for {year}.")
    return _serialise_edition(db, edition)
