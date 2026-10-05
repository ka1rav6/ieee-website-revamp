"""Admin management of collaborations, events and IEEE Day editions."""

from __future__ import annotations

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.admin._crud import (
    apply_order,
    assign_slug,
    get_or_404,
    payload_to_columns,
)
from app.core.deps import CurrentAdmin, DbSession
from app.core.errors import NotFoundError
from app.models.content import (
    Collaboration,
    Event,
    IeeeDayEdition,
    IeeeDayHighlight,
    IeeeDayPhoto,
    IeeeDayStat,
)
from app.schemas.common import Message, Page
from app.schemas.content import (
    CollaborationAdmin,
    CollaborationCreate,
    CollaborationUpdate,
    EventAdmin,
    EventCreate,
    EventUpdate,
    IeeeDayEditionPublic,
    IeeeDayEditionWrite,
    ReorderRequest,
)

collaborations_router = APIRouter(prefix="/collaborations", tags=["admin:collaborations"])
events_router = APIRouter(prefix="/events", tags=["admin:events"])
ieee_day_router = APIRouter(prefix="/ieee-day", tags=["admin:ieee-day"])


# ---------------------------------------------------------------------------
# Collaborations
# ---------------------------------------------------------------------------


@collaborations_router.get("", response_model=list[CollaborationAdmin])
def list_collaborations(admin: CurrentAdmin, db: DbSession) -> list[CollaborationAdmin]:
    del admin
    rows = db.scalars(
        select(Collaboration).order_by(Collaboration.sort_order, Collaboration.name)
    ).all()
    return [CollaborationAdmin.model_validate(c, from_attributes=True) for c in rows]


@collaborations_router.post(
    "", response_model=CollaborationAdmin, status_code=status.HTTP_201_CREATED
)
def create_collaboration(
    payload: CollaborationCreate, admin: CurrentAdmin, db: DbSession
) -> CollaborationAdmin:
    del admin
    data = payload_to_columns(payload, partial=False)
    requested_slug = data.pop("slug", None)
    collaboration = Collaboration(**data)
    collaboration.slug = assign_slug(
        db, Collaboration, requested=requested_slug, fallback=payload.name, max_length=160
    )
    db.add(collaboration)
    db.commit()
    db.refresh(collaboration)
    return CollaborationAdmin.model_validate(collaboration, from_attributes=True)


@collaborations_router.patch("/{collaboration_id}", response_model=CollaborationAdmin)
def update_collaboration(
    collaboration_id: int,
    payload: CollaborationUpdate,
    admin: CurrentAdmin,
    db: DbSession,
) -> CollaborationAdmin:
    del admin
    collaboration = get_or_404(db, Collaboration, collaboration_id, "Collaboration")
    data = payload_to_columns(payload, partial=True)
    if data.get("slug"):
        data["slug"] = assign_slug(
            db,
            Collaboration,
            requested=data["slug"],
            fallback=collaboration.name,
            exclude_id=collaboration.id,
            max_length=160,
        )
    else:
        data.pop("slug", None)
    for field, value in data.items():
        setattr(collaboration, field, value)
    db.commit()
    db.refresh(collaboration)
    return CollaborationAdmin.model_validate(collaboration, from_attributes=True)


@collaborations_router.post("/reorder", response_model=Message)
def reorder_collaborations(payload: ReorderRequest, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    count = apply_order(db, Collaboration, payload.ids, "collaboration")
    return Message(detail=f"Reordered {count} collaborations.")


@collaborations_router.delete("/{collaboration_id}", response_model=Message)
def delete_collaboration(collaboration_id: int, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    collaboration = get_or_404(db, Collaboration, collaboration_id, "Collaboration")
    name = collaboration.name
    db.delete(collaboration)
    db.commit()
    return Message(detail=f"Removed the {name} collaboration.")


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


@events_router.get("", response_model=Page[EventAdmin])
def list_events(
    admin: CurrentAdmin,
    db: DbSession,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, max_length=200),
) -> Page[EventAdmin]:
    del admin
    query = select(Event)
    if search:
        query = query.where(Event.title.ilike(f"%{search.strip()}%"))
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    events = db.scalars(
        query.order_by(Event.event_date.desc().nulls_last(), Event.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()
    return Page(
        items=[EventAdmin.model_validate(e, from_attributes=True) for e in events],
        total=total,
        page=page,
        per_page=per_page,
    )


@events_router.post("", response_model=EventAdmin, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, admin: CurrentAdmin, db: DbSession) -> EventAdmin:
    del admin
    data = payload_to_columns(payload, partial=False)
    requested_slug = data.pop("slug", None)
    event = Event(**data)
    event.slug = assign_slug(
        db, Event, requested=requested_slug, fallback=payload.title, max_length=220
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return EventAdmin.model_validate(event, from_attributes=True)


@events_router.patch("/{event_id}", response_model=EventAdmin)
def update_event(
    event_id: int, payload: EventUpdate, admin: CurrentAdmin, db: DbSession
) -> EventAdmin:
    del admin
    event = get_or_404(db, Event, event_id, "Event")
    data = payload_to_columns(payload, partial=True)
    if data.get("slug"):
        data["slug"] = assign_slug(
            db,
            Event,
            requested=data["slug"],
            fallback=event.title,
            exclude_id=event.id,
            max_length=220,
        )
    else:
        data.pop("slug", None)
    for field, value in data.items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return EventAdmin.model_validate(event, from_attributes=True)


@events_router.post("/reorder", response_model=Message)
def reorder_events(payload: ReorderRequest, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    count = apply_order(db, Event, payload.ids, "event")
    return Message(detail=f"Reordered {count} events.")


@events_router.delete("/{event_id}", response_model=Message)
def delete_event(event_id: int, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    event = get_or_404(db, Event, event_id, "Event")
    title = event.title
    db.delete(event)
    db.commit()
    return Message(detail=f"Deleted '{title}'.")


# ---------------------------------------------------------------------------
# IEEE Day
# ---------------------------------------------------------------------------


def _edition_query():
    return select(IeeeDayEdition).options(
        selectinload(IeeeDayEdition.highlights),
        selectinload(IeeeDayEdition.stats),
        selectinload(IeeeDayEdition.gallery),
    )


@ieee_day_router.get("", response_model=list[IeeeDayEditionPublic])
def list_editions(admin: CurrentAdmin, db: DbSession) -> list[IeeeDayEditionPublic]:
    del admin
    editions = db.scalars(_edition_query().order_by(IeeeDayEdition.year.desc())).all()
    return [IeeeDayEditionPublic.model_validate(e, from_attributes=True) for e in editions]


def _write_edition(
    db: DbSession, edition: IeeeDayEdition, payload: IeeeDayEditionWrite
) -> IeeeDayEdition:
    """Apply an edition payload, replacing its child collections wholesale.

    Highlights, stats and gallery images are edited as a set in the admin UI,
    so replacing them is simpler and less error-prone than diffing rows.
    """
    edition.year = payload.year
    edition.theme = payload.theme
    edition.tagline = payload.tagline
    edition.description = payload.description
    edition.celebrated_on = payload.celebrated_on
    edition.hero_image = payload.hero_image
    edition.is_current = payload.is_current

    edition.highlights = [
        IeeeDayHighlight(
            title=item.title, description=item.description, image=item.image, sort_order=index
        )
        for index, item in enumerate(payload.highlights)
    ]
    edition.stats = [
        IeeeDayStat(label=item.label, value=item.value, sort_order=index)
        for index, item in enumerate(payload.stats)
    ]
    edition.gallery = [
        IeeeDayPhoto(image=item.image, caption=item.caption, sort_order=index)
        for index, item in enumerate(payload.gallery)
    ]

    # Exactly one edition is the current one, so the page always has a hero.
    if payload.is_current:
        db.execute(
            IeeeDayEdition.__table__.update()
            .where(IeeeDayEdition.year != payload.year)
            .values(is_current=False)
        )
    return edition


@ieee_day_router.put("/{year}", response_model=IeeeDayEditionPublic)
def upsert_edition(
    year: int, payload: IeeeDayEditionWrite, admin: CurrentAdmin, db: DbSession
) -> IeeeDayEditionPublic:
    """Create or replace one IEEE Day edition."""
    del admin
    if payload.year != year:
        raise NotFoundError("The year in the URL and the payload must match.")

    edition = db.scalar(_edition_query().where(IeeeDayEdition.year == year))
    if edition is None:
        edition = IeeeDayEdition(year=year)
        db.add(edition)

    _write_edition(db, edition, payload)
    db.commit()
    db.refresh(edition)
    return IeeeDayEditionPublic.model_validate(edition, from_attributes=True)


@ieee_day_router.delete("/{year}", response_model=Message)
def delete_edition(year: int, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    edition = db.scalar(select(IeeeDayEdition).where(IeeeDayEdition.year == year))
    if edition is None:
        raise NotFoundError(f"No IEEE Day edition recorded for {year}.")
    db.delete(edition)
    db.commit()
    return Message(detail=f"Deleted the {year} IEEE Day edition.")
