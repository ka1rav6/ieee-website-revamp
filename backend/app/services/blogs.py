"""Blog querying and serialisation.

The public selector lives here so that every public code path filters on
`is_published` the same way; a draft cannot leak because a router forgot a
WHERE clause.
"""

from __future__ import annotations

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.content import BlogCategory, BlogPost, BlogTag, blog_post_tags
from app.schemas.content import BlogPostPublic, BlogPostSummary
from app.services.text import build_excerpt, reading_minutes, render_markdown

# How many related posts to show beneath an article.
RELATED_POST_LIMIT = 3


def published_posts() -> Select[tuple[BlogPost]]:
    """Base query for publicly visible posts, newest first.

    Posts imported from the previous site have no date, so they sort last
    rather than being dropped.
    """
    return (
        select(BlogPost)
        .where(BlogPost.is_published.is_(True))
        .options(selectinload(BlogPost.category), selectinload(BlogPost.tags))
        .order_by(
            BlogPost.published_at.desc().nulls_last(),
            BlogPost.id.desc(),
        )
    )


def apply_filters(
    query: Select[tuple[BlogPost]],
    *,
    category: str | None = None,
    tag: str | None = None,
    search: str | None = None,
    featured: bool | None = None,
) -> Select[tuple[BlogPost]]:
    """Narrow a post query by the facets the listing page offers."""
    if category:
        query = query.join(BlogCategory, BlogPost.category_id == BlogCategory.id).where(
            BlogCategory.slug == category
        )
    if tag:
        query = query.where(
            BlogPost.id.in_(
                select(blog_post_tags.c.post_id)
                .join(BlogTag, BlogTag.id == blog_post_tags.c.tag_id)
                .where(BlogTag.slug == tag)
            )
        )
    if search:
        # Case-insensitive substring match across the fields a reader would
        # search by. Adequate for a few hundred posts; a tsvector index is the
        # next step if the archive grows.
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                BlogPost.title.ilike(pattern),
                BlogPost.excerpt.ilike(pattern),
                BlogPost.author_name.ilike(pattern),
                BlogPost.body.ilike(pattern),
            )
        )
    if featured is not None:
        query = query.where(BlogPost.is_featured.is_(featured))
    return query


def count_posts(db: Session, query: Select[tuple[BlogPost]]) -> int:
    """Total rows a filtered post query would return."""
    subquery = query.order_by(None).options().subquery()
    return db.scalar(select(func.count()).select_from(subquery)) or 0


def to_summary(post: BlogPost) -> BlogPostSummary:
    summary = BlogPostSummary.model_validate(post, from_attributes=True)
    # Derive the card's supporting text when the author did not write one.
    if not summary.excerpt:
        summary.excerpt = build_excerpt(post.body)
    if summary.reading_minutes is None:
        summary.reading_minutes = reading_minutes(post.body)
    return summary


def to_public(db: Session, post: BlogPost) -> BlogPostPublic:
    """Render a post for its own page, including related reading."""
    return BlogPostPublic(
        **to_summary(post).model_dump(),
        body_html=render_markdown(post.body),
        related=[to_summary(related) for related in find_related(db, post)],
    )


def find_related(db: Session, post: BlogPost) -> list[BlogPost]:
    """Posts worth reading next: same category first, then recent ones."""
    query = published_posts().where(BlogPost.id != post.id)

    related: list[BlogPost] = []
    if post.category_id is not None:
        related = list(
            db.scalars(
                query.where(BlogPost.category_id == post.category_id).limit(RELATED_POST_LIMIT)
            )
        )

    if len(related) < RELATED_POST_LIMIT:
        seen = {post.id, *(p.id for p in related)}
        filler = db.scalars(
            query.where(BlogPost.id.notin_(seen)).limit(RELATED_POST_LIMIT - len(related))
        )
        related.extend(filler)

    return related
