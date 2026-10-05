"""Admin notifications for site events."""

from __future__ import annotations

from app.core.config import settings
from app.models.content import ContactSubmission
from app.services.email import send_email

INQUIRY_LABELS = {
    "general": "General enquiry",
    "membership": "Membership",
    "industry_collaboration": "Industry collaboration",
    "event_sponsorship": "Event sponsorship",
    "workshop": "Technical workshop",
    "talk": "Talk / speaker session",
    "research": "Research collaboration",
    "other": "Other",
}


def notify_new_submission(submission: ContactSubmission) -> bool:
    """Tell the administrator that a new enquiry arrived."""
    label = INQUIRY_LABELS.get(submission.inquiry_type.value, submission.inquiry_type.value)
    lines = [
        f"New {label.lower()} via the IEEE IIIT Delhi website.",
        "",
        f"Name:         {submission.name}",
        f"Email:        {submission.email}",
    ]
    if submission.organization:
        lines.append(f"Organisation: {submission.organization}")
    if submission.phone:
        lines.append(f"Phone:        {submission.phone}")
    if submission.subject:
        lines.append(f"Subject:      {submission.subject}")
    lines += [
        "",
        "Message:",
        submission.message,
        "",
        f"Manage submissions: {settings.site_url}/admin/submissions",
    ]

    subject = f"[IEEE IIITD] {label}: {submission.subject or submission.name}"
    return send_email(to=settings.notification_recipient, subject=subject, body="\n".join(lines))
