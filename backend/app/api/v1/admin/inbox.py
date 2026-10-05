"""Admin inbox for contact submissions, site settings and image uploads."""

from __future__ import annotations

from fastapi import APIRouter, File, Query, UploadFile, status
from sqlalchemy import func, select

from app.api.v1.admin._crud import get_or_404
from app.core.config import settings as app_settings
from app.core.deps import CurrentAdmin, DbSession
from app.models.content import ContactSubmission, SiteSetting, SubmissionStatus
from app.schemas.common import Message, Page
from app.schemas.content import (
    ContactSubmissionAdmin,
    ContactSubmissionUpdate,
    SiteSettingsUpdate,
)
from app.services.uploads import delete_image, save_image

submissions_router = APIRouter(prefix="/submissions", tags=["admin:submissions"])
settings_router = APIRouter(prefix="/settings", tags=["admin:settings"])
uploads_router = APIRouter(prefix="/uploads", tags=["admin:uploads"])


# ---------------------------------------------------------------------------
# Contact submissions
# ---------------------------------------------------------------------------


@submissions_router.get("", response_model=Page[ContactSubmissionAdmin])
def list_submissions(
    admin: CurrentAdmin,
    db: DbSession,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    submission_status: SubmissionStatus | None = Query(None, alias="status"),
) -> Page[ContactSubmissionAdmin]:
    del admin
    query = select(ContactSubmission)
    if submission_status is not None:
        query = query.where(ContactSubmission.status == submission_status)
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = db.scalars(
        query.order_by(ContactSubmission.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()
    return Page(
        items=[ContactSubmissionAdmin.model_validate(r, from_attributes=True) for r in rows],
        total=total,
        page=page,
        per_page=per_page,
    )


@submissions_router.get("/unread-count", response_model=dict[str, int])
def count_unread(admin: CurrentAdmin, db: DbSession) -> dict[str, int]:
    """Badge count for the admin navigation."""
    del admin
    unread = db.scalar(
        select(func.count())
        .select_from(ContactSubmission)
        .where(ContactSubmission.status == SubmissionStatus.NEW)
    )
    return {"unread": unread or 0}


@submissions_router.get("/{submission_id}", response_model=ContactSubmissionAdmin)
def read_submission(
    submission_id: int, admin: CurrentAdmin, db: DbSession
) -> ContactSubmissionAdmin:
    """Read one submission, marking it as seen."""
    del admin
    submission = get_or_404(db, ContactSubmission, submission_id, "Submission")
    if submission.status == SubmissionStatus.NEW:
        submission.status = SubmissionStatus.READ
        db.commit()
        db.refresh(submission)
    return ContactSubmissionAdmin.model_validate(submission, from_attributes=True)


@submissions_router.patch("/{submission_id}", response_model=ContactSubmissionAdmin)
def update_submission(
    submission_id: int,
    payload: ContactSubmissionUpdate,
    admin: CurrentAdmin,
    db: DbSession,
) -> ContactSubmissionAdmin:
    del admin
    submission = get_or_404(db, ContactSubmission, submission_id, "Submission")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(submission, field, value)
    db.commit()
    db.refresh(submission)
    return ContactSubmissionAdmin.model_validate(submission, from_attributes=True)


@submissions_router.delete("/{submission_id}", response_model=Message)
def delete_submission(submission_id: int, admin: CurrentAdmin, db: DbSession) -> Message:
    del admin
    submission = get_or_404(db, ContactSubmission, submission_id, "Submission")
    db.delete(submission)
    db.commit()
    return Message(detail="Submission deleted.")


# ---------------------------------------------------------------------------
# Site settings
# ---------------------------------------------------------------------------


@settings_router.get("", response_model=dict[str, str])
def read_settings(admin: CurrentAdmin, db: DbSession) -> dict[str, str]:
    del admin
    return {row.key: row.value for row in db.scalars(select(SiteSetting))}


@settings_router.put("", response_model=dict[str, str])
def update_settings(
    payload: SiteSettingsUpdate, admin: CurrentAdmin, db: DbSession
) -> dict[str, str]:
    """Upsert the given keys, leaving any others untouched."""
    del admin
    for key, value in payload.values.items():
        existing = db.get(SiteSetting, key)
        if existing is None:
            db.add(SiteSetting(key=key, value=value))
        else:
            existing.value = value
    db.commit()
    return {row.key: row.value for row in db.scalars(select(SiteSetting))}


# ---------------------------------------------------------------------------
# Uploads
# ---------------------------------------------------------------------------


@uploads_router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file(
    admin: CurrentAdmin,
    file: UploadFile = File(..., description="JPEG, PNG, WebP or GIF image"),
) -> dict[str, str | int]:
    """Store an image and return the URL to reference it by.

    Reading the body here is bounded by the configured size limit, which is
    checked against the bytes actually received rather than a client-supplied
    Content-Length.
    """
    del admin
    content = await file.read(app_settings.max_upload_size_bytes + 1)
    stored = save_image(content=content, content_type=file.content_type, filename=file.filename)
    return {
        "url": stored.url,
        "width": stored.width,
        "height": stored.height,
        "size_bytes": stored.size_bytes,
    }


@uploads_router.delete("", response_model=Message)
def remove_upload(
    admin: CurrentAdmin,
    url: str = Query(..., max_length=500, description="URL returned by the upload endpoint"),
) -> Message:
    del admin
    removed = delete_image(url)
    return Message(detail="Image deleted." if removed else "No such image.")
