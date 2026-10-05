"""Admin management of team members and alumni."""

from __future__ import annotations

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.v1.admin._crud import (
    apply_order,
    assign_slug,
    get_or_404,
    payload_to_columns,
)
from app.core.deps import CurrentAdmin, DbSession
from app.models.content import Alumnus, TeamCategory, TeamMember
from app.schemas.common import Message
from app.schemas.content import (
    AlumnusAdmin,
    AlumnusCreate,
    AlumnusUpdate,
    ReorderRequest,
    TeamMemberAdmin,
    TeamMemberCreate,
    TeamMemberUpdate,
)

team_router = APIRouter(prefix="/team", tags=["admin:team"])
alumni_router = APIRouter(prefix="/alumni", tags=["admin:alumni"])


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------


@team_router.get("", response_model=list[TeamMemberAdmin])
def list_members(
    admin: CurrentAdmin,
    db: DbSession,
    category: TeamCategory | None = None,
    include_inactive: bool = Query(True),
) -> list[TeamMemberAdmin]:
    del admin
    query = select(TeamMember)
    if category is not None:
        query = query.where(TeamMember.category == category)
    if not include_inactive:
        query = query.where(TeamMember.is_active.is_(True))
    members = db.scalars(
        query.order_by(TeamMember.category, TeamMember.sort_order, TeamMember.name)
    ).all()
    return [TeamMemberAdmin.model_validate(m, from_attributes=True) for m in members]


@team_router.post("", response_model=TeamMemberAdmin, status_code=status.HTTP_201_CREATED)
def create_member(payload: TeamMemberCreate, admin: CurrentAdmin, db: DbSession) -> TeamMemberAdmin:
    del admin
    data = payload_to_columns(payload, partial=False)
    requested_slug = data.pop("slug", None)
    member = TeamMember(**data)
    member.slug = assign_slug(
        db, TeamMember, requested=requested_slug, fallback=payload.name, max_length=160
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return TeamMemberAdmin.model_validate(member, from_attributes=True)


@team_router.patch("/{member_id}", response_model=TeamMemberAdmin)
def update_member(
    member_id: int, payload: TeamMemberUpdate, admin: CurrentAdmin, db: DbSession
) -> TeamMemberAdmin:
    del admin
    member = get_or_404(db, TeamMember, member_id, "Team member")
    data = payload_to_columns(payload, partial=True)
    if data.get("slug"):
        data["slug"] = assign_slug(
            db,
            TeamMember,
            requested=data["slug"],
            fallback=member.name,
            exclude_id=member.id,
            max_length=160,
        )
    else:
        data.pop("slug", None)
    for field, value in data.items():
        setattr(member, field, value)
    db.commit()
    db.refresh(member)
    return TeamMemberAdmin.model_validate(member, from_attributes=True)


@team_router.post("/reorder", response_model=Message)
def reorder_members(payload: ReorderRequest, admin: CurrentAdmin, db: DbSession) -> Message:
    """Set the display order of team cards."""
    del admin
    count = apply_order(db, TeamMember, payload.ids, "team member")
    return Message(detail=f"Reordered {count} team members.")


@team_router.delete("/{member_id}", response_model=Message)
def delete_member(member_id: int, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    member = get_or_404(db, TeamMember, member_id, "Team member")
    name = member.name
    db.delete(member)
    db.commit()
    return Message(detail=f"Removed {name} from the team.")


# ---------------------------------------------------------------------------
# Alumni
# ---------------------------------------------------------------------------


@alumni_router.get("", response_model=list[AlumnusAdmin])
def list_alumni(admin: CurrentAdmin, db: DbSession) -> list[AlumnusAdmin]:
    del admin
    alumni = db.scalars(
        select(Alumnus).order_by(
            Alumnus.sort_order, Alumnus.graduation_year.desc().nulls_last(), Alumnus.name
        )
    ).all()
    return [AlumnusAdmin.model_validate(a, from_attributes=True) for a in alumni]


@alumni_router.post("", response_model=AlumnusAdmin, status_code=status.HTTP_201_CREATED)
def create_alumnus(payload: AlumnusCreate, admin: CurrentAdmin, db: DbSession) -> AlumnusAdmin:
    del admin
    data = payload_to_columns(payload, partial=False)
    requested_slug = data.pop("slug", None)
    alumnus = Alumnus(**data)
    alumnus.slug = assign_slug(
        db, Alumnus, requested=requested_slug, fallback=payload.name, max_length=160
    )
    db.add(alumnus)
    db.commit()
    db.refresh(alumnus)
    return AlumnusAdmin.model_validate(alumnus, from_attributes=True)


@alumni_router.patch("/{alumnus_id}", response_model=AlumnusAdmin)
def update_alumnus(
    alumnus_id: int, payload: AlumnusUpdate, admin: CurrentAdmin, db: DbSession
) -> AlumnusAdmin:
    del admin
    alumnus = get_or_404(db, Alumnus, alumnus_id, "Alumnus")
    data = payload_to_columns(payload, partial=True)
    if data.get("slug"):
        data["slug"] = assign_slug(
            db,
            Alumnus,
            requested=data["slug"],
            fallback=alumnus.name,
            exclude_id=alumnus.id,
            max_length=160,
        )
    else:
        data.pop("slug", None)
    for field, value in data.items():
        setattr(alumnus, field, value)
    db.commit()
    db.refresh(alumnus)
    return AlumnusAdmin.model_validate(alumnus, from_attributes=True)


@alumni_router.post("/reorder", response_model=Message)
def reorder_alumni(payload: ReorderRequest, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    count = apply_order(db, Alumnus, payload.ids, "alumnus")
    return Message(detail=f"Reordered {count} alumni.")


@alumni_router.delete("/{alumnus_id}", response_model=Message)
def delete_alumnus(alumnus_id: int, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    alumnus = get_or_404(db, Alumnus, alumnus_id, "Alumnus")
    name = alumnus.name
    db.delete(alumnus)
    db.commit()
    return Message(detail=f"Removed {name} from alumni.")
