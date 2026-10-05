"""Admin blog management: drafts, publishing, categories and tags."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.admin._crud import assign_slug, get_or_404, payload_to_columns
from app.core.deps import CurrentAdmin, DbSession
from app.core.errors import ConflictError, NotFoundError
from app.models.content import BlogCategory, BlogPost, BlogTag
from app.schemas.common import Message, Page
from app.schemas.content import (
    BlogCategoryPublic,
    BlogCategoryWrite,
    BlogPostAdmin,
    BlogPostCreate,
    BlogPostUpdate,
)
from app.services.text import build_excerpt, reading_minutes, slugify

router = APIRouter(prefix="/blogs", tags=["admin:blogs"])


def _with_relations():
    return select(BlogPost).options(selectinload(BlogPost.category), selectinload(BlogPost.tags))


def _to_admin(post: BlogPost) -> BlogPostAdmin:
    schema = BlogPostAdmin.model_validate(post, from_attributes=True)
    schema.category_slug = post.category.slug if post.category else None
    return schema


def _resolve_category(db: DbSession, slug: str | None) -> BlogCategory | None:
    if not slug:
        return None
    category = db.scalar(select(BlogCategory).where(BlogCategory.slug == slug))
    if category is None:
        raise NotFoundError(f"No blog category with slug '{slug}'.")
    return category


def _resolve_tags(db: DbSession, names: list[str]) -> list[BlogTag]:
    """Look up tags by name, creating any that do not exist yet.

    Tags are free-form by design, so the editor does not have to pre-register
    a keyword before using it.
    """
    tags: list[BlogTag] = []
    for raw in names:
        name = raw.strip()
        if not name:
            continue
        slug = slugify(name, max_length=80)
        if not slug:
            continue
        tag = db.scalar(select(BlogTag).where(BlogTag.slug == slug))
        if tag is None:
            tag = BlogTag(slug=slug, name=name)
            db.add(tag)
            db.flush()
        tags.append(tag)
    return tags


def _apply_derived_fields(post: BlogPost) -> None:
    """Keep excerpt and reading time in step with the body."""
    if not post.excerpt:
        post.excerpt = build_excerpt(post.body)
    post.reading_minutes = reading_minutes(post.body)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[BlogCategoryPublic])
def list_categories(admin: CurrentAdmin, db: DbSession) -> list[BlogCategoryPublic]:
    del admin
    rows = db.execute(
        select(BlogCategory, func.count(BlogPost.id))
        .outerjoin(BlogPost, BlogPost.category_id == BlogCategory.id)
        .group_by(BlogCategory.id)
        .order_by(BlogCategory.sort_order, BlogCategory.name)
    ).all()
    return [
        BlogCategoryPublic(slug=c.slug, name=c.name, description=c.description, post_count=count)
        for c, count in rows
    ]


@router.post("/categories", response_model=BlogCategoryPublic, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: BlogCategoryWrite, admin: CurrentAdmin, db: DbSession
) -> BlogCategoryPublic:
    del admin
    slug = assign_slug(
        db, BlogCategory, requested=payload.slug, fallback=payload.name, max_length=120
    )
    category = BlogCategory(
        slug=slug,
        name=payload.name,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return BlogCategoryPublic.model_validate(category, from_attributes=True)


@router.put("/categories/{slug}", response_model=BlogCategoryPublic)
def update_category(
    slug: str, payload: BlogCategoryWrite, admin: CurrentAdmin, db: DbSession
) -> BlogCategoryPublic:
    del admin
    category = db.scalar(select(BlogCategory).where(BlogCategory.slug == slug))
    if category is None:
        raise NotFoundError(f"No blog category with slug '{slug}'.")

    if payload.slug and payload.slug != category.slug:
        category.slug = assign_slug(
            db,
            BlogCategory,
            requested=payload.slug,
            fallback=payload.name,
            exclude_id=category.id,
            max_length=120,
        )
    category.name = payload.name
    category.description = payload.description
    category.sort_order = payload.sort_order
    db.commit()
    db.refresh(category)
    return BlogCategoryPublic.model_validate(category, from_attributes=True)


@router.delete("/categories/{slug}", response_model=Message)
def delete_category(slug: str, admin: CurrentAdmin, db: DbSession) -> Message:
    """Delete a category.

    Refused while posts still reference it, so articles cannot be silently
    orphaned out of their section.
    """
    del admin
    category = db.scalar(select(BlogCategory).where(BlogCategory.slug == slug))
    if category is None:
        raise NotFoundError(f"No blog category with slug '{slug}'.")

    in_use = db.scalar(
        select(func.count()).select_from(BlogPost).where(BlogPost.category_id == category.id)
    )
    if in_use:
        raise ConflictError(
            f"'{category.name}' still has {in_use} post(s). Move them to another "
            "category before deleting it."
        )

    db.delete(category)
    db.commit()
    return Message(detail=f"Deleted category '{category.name}'.")


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


@router.get("", response_model=Page[BlogPostAdmin])
def list_posts(
    admin: CurrentAdmin,
    db: DbSession,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    published: bool | None = Query(None, description="Filter by publication state"),
    search: str | None = Query(None, max_length=200),
) -> Page[BlogPostAdmin]:
    """Every post, drafts included."""
    del admin
    query = _with_relations()
    if published is not None:
        query = query.where(BlogPost.is_published.is_(published))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(BlogPost.title.ilike(pattern) | BlogPost.author_name.ilike(pattern))

    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    posts = db.scalars(
        query.order_by(BlogPost.updated_at.desc()).offset((page - 1) * per_page).limit(per_page)
    ).all()
    return Page(items=[_to_admin(p) for p in posts], total=total, page=page, per_page=per_page)


@router.get("/{post_id}", response_model=BlogPostAdmin)
def read_post(post_id: int, admin: CurrentAdmin, db: DbSession) -> BlogPostAdmin:
    del admin
    post = db.scalar(_with_relations().where(BlogPost.id == post_id))
    if post is None:
        raise NotFoundError(f"Blog post {post_id} does not exist.")
    return _to_admin(post)


@router.post("", response_model=BlogPostAdmin, status_code=status.HTTP_201_CREATED)
def create_post(payload: BlogPostCreate, admin: CurrentAdmin, db: DbSession) -> BlogPostAdmin:
    del admin
    data = payload_to_columns(payload, partial=False)
    tag_names = data.pop("tags", [])
    category_slug = data.pop("category_slug", None)
    requested_slug = data.pop("slug", None)

    post = BlogPost(**data)
    post.slug = assign_slug(
        db, BlogPost, requested=requested_slug, fallback=payload.title, max_length=220
    )
    post.category = _resolve_category(db, category_slug)
    post.tags = _resolve_tags(db, tag_names)
    _apply_derived_fields(post)

    db.add(post)
    db.commit()
    db.refresh(post)
    return _to_admin(post)


@router.patch("/{post_id}", response_model=BlogPostAdmin)
def update_post(
    post_id: int, payload: BlogPostUpdate, admin: CurrentAdmin, db: DbSession
) -> BlogPostAdmin:
    del admin
    post = get_or_404(db, BlogPost, post_id, "Blog post")
    data = payload_to_columns(payload, partial=True)

    if "tags" in data:
        post.tags = _resolve_tags(db, data.pop("tags") or [])
    if "category_slug" in data:
        post.category = _resolve_category(db, data.pop("category_slug"))
    if data.get("slug"):
        data["slug"] = assign_slug(
            db,
            BlogPost,
            requested=data["slug"],
            fallback=post.title,
            exclude_id=post.id,
            max_length=220,
        )
    else:
        data.pop("slug", None)

    for field, value in data.items():
        setattr(post, field, value)

    if "body" in data:
        post.reading_minutes = reading_minutes(post.body)
    if not post.excerpt:
        post.excerpt = build_excerpt(post.body)

    db.commit()
    db.refresh(post)
    return _to_admin(post)


@router.post("/{post_id}/publish", response_model=BlogPostAdmin)
def set_publication(
    post_id: int,
    admin: CurrentAdmin,
    db: DbSession,
    published: bool = Query(True),
) -> BlogPostAdmin:
    """Publish or unpublish a post.

    Publishing stamps today's date when the post has none, so a newly
    published article is never dateless in the listing.
    """
    del admin
    post = get_or_404(db, BlogPost, post_id, "Blog post")
    post.is_published = published
    if published and post.published_at is None:
        post.published_at = date.today()
    db.commit()
    db.refresh(post)
    return _to_admin(post)


@router.delete("/{post_id}", response_model=Message)
def delete_post(post_id: int, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    post = get_or_404(db, BlogPost, post_id, "Blog post")
    title = post.title
    db.delete(post)
    db.commit()
    return Message(detail=f"Deleted '{title}'.")
