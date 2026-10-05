"""Contact and collaboration form submissions."""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, status

from app.core.config import settings
from app.core.deps import ClientIp, DbSession
from app.core.errors import RateLimitError
from app.core.rate_limit import RateLimiter
from app.models.content import ContactSubmission
from app.schemas.content import ContactSubmissionCreate, ContactSubmissionPublic
from app.services.notifications import notify_new_submission

logger = logging.getLogger("app.contact")

router = APIRouter(prefix="/contact", tags=["contact"])

# Generous enough for a genuine sender who mistypes their address, tight
# enough to make scripted form spam pointless.
submission_limiter = RateLimiter(limit=5, window_seconds=3600)


@router.post("", response_model=ContactSubmissionPublic, status_code=status.HTTP_201_CREATED)
def create_submission(
    payload: ContactSubmissionCreate,
    db: DbSession,
    ip: ClientIp,
    background: BackgroundTasks,
) -> ContactSubmissionPublic:
    """Record an enquiry and notify the administrator.

    The submission is committed before the notification is queued, so a mail
    outage can delay the alert but never lose the message.
    """
    retry_after = submission_limiter.check(f"contact:{ip}")
    if retry_after is not None:
        raise RateLimitError(
            retry_after,
            detail="You have sent several messages recently. Please try again later.",
        )

    submission = ContactSubmission(
        name=payload.name,
        email=payload.email.lower(),
        organization=payload.organization,
        phone=payload.phone,
        inquiry_type=payload.inquiry_type,
        subject=payload.subject,
        message=payload.message,
        source_ip=ip,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    if settings.email_backend != "none":
        background.add_task(notify_new_submission, submission)

    logger.info("Stored contact submission %s (%s)", submission.id, submission.inquiry_type.value)
    return ContactSubmissionPublic.model_validate(submission, from_attributes=True)
