"""Outbound notification email.

The provider is chosen by EMAIL_BACKEND so the branch can switch from console
logging to SMTP (or to a future provider) without touching application code.
Delivery never blocks or fails a request: contact submissions are stored
first, and a notification failure is logged, not raised.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import Settings, settings

logger = logging.getLogger("app.email")


class EmailDeliveryError(Exception):
    """Raised by a backend that could not hand the message off."""


def _build_message(*, to: str, subject: str, body: str, cfg: Settings) -> EmailMessage:
    message = EmailMessage()
    message["From"] = cfg.email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    return message


def _send_smtp(message: EmailMessage, cfg: Settings) -> None:
    if not cfg.smtp_host:
        raise EmailDeliveryError("EMAIL_BACKEND is 'smtp' but SMTP_HOST is not set")

    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=15) as client:
        if cfg.smtp_use_tls:
            client.starttls()
        if cfg.smtp_username:
            client.login(cfg.smtp_username, cfg.smtp_password)
        client.send_message(message)


def send_email(*, to: str, subject: str, body: str, cfg: Settings | None = None) -> bool:
    """Deliver one message. Returns whether it was handed off successfully."""
    cfg = cfg or settings

    if cfg.email_backend == "none":
        return False

    if cfg.email_backend == "console":
        # Useful in development and a reasonable default in production: the
        # submission is already safely in the database either way.
        logger.info("Email to %s | %s\n%s", to, subject, body)
        return True

    message = _build_message(to=to, subject=subject, body=body, cfg=cfg)
    try:
        _send_smtp(message, cfg)
    except (smtplib.SMTPException, OSError, EmailDeliveryError) as exc:
        logger.error("Could not send notification to %s: %s", to, exc)
        return False
    return True
