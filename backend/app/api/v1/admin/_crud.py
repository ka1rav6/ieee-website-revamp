"""Helpers shared by the admin content routers.

Five entities (team, alumni, collaborations, events, blog categories) have the
same shape: slug-addressed, explicitly ordered, created from a Pydantic model.
These helpers cover only that repetition; anything entity-specific stays in
the router so it remains obvious what each endpoint does.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.base import Base
from app.services.text import slugify, unique_slug

# Pydantic coerces URL fields to its own types; the database wants strings.
_URL_FIELDS = ("linkedin_url", "github_url", "website_url", "registration_url")


def payload_to_columns(payload: BaseModel, *, partial: bool) -> dict[str, Any]:
    """Model fields as plain column values.

    With `partial=True` only fields the client actually sent are returned, so
    a PATCH never clears a column the admin did not touch.
    """
    data = payload.model_dump(exclude_unset=partial)
    for field in _URL_FIELDS:
        if field in data and data[field] is not None:
            data[field] = str(data[field])
    return data


def get_or_404[ModelT: Base](
    db: Session, model: type[ModelT], record_id: int, label: str
) -> ModelT:
    record = db.get(model, record_id)
    if record is None:
        raise NotFoundError(f"{label} {record_id} does not exist.")
    return record


def assign_slug(
    db: Session,
    model: type[Any],
    *,
    requested: str | None,
    fallback: str,
    exclude_id: int | None = None,
    max_length: int = 200,
) -> str:
    """Resolve the slug to store.

    An explicitly requested slug must be unique and is reported as a conflict
    if it is not, because silently renaming what the admin typed would be
    surprising. A derived slug is de-duplicated automatically.
    """

    def taken(candidate: str) -> bool:
        query = select(model.id).where(model.slug == candidate)
        if exclude_id is not None:
            query = query.where(model.id != exclude_id)
        return db.scalar(query) is not None

    if requested:
        cleaned = slugify(requested, max_length=max_length)
        if not cleaned:
            raise ConflictError("That slug contains no usable characters.")
        if taken(cleaned):
            raise ConflictError(f"The slug '{cleaned}' is already in use.")
        return cleaned

    return unique_slug(fallback, taken, max_length=max_length)


def apply_order(db: Session, model: type[Any], ids: list[int], label: str) -> int:
    """Renumber `sort_order` to match the given id order.

    All ids must belong to the entity, so a malformed request cannot silently
    reorder only part of a listing.
    """
    found = set(db.scalars(select(model.id).where(model.id.in_(ids))).all())
    missing = [record_id for record_id in ids if record_id not in found]
    if missing:
        raise NotFoundError(f"Unknown {label} ids: {missing}")

    for position, record_id in enumerate(ids):
        db.execute(
            model.__table__.update().where(model.id == record_id).values(sort_order=position)
        )
    db.commit()
    return len(ids)
