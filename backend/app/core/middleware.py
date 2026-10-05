"""Security response headers.

The site serves its own frontend, so the policy can be strict: no framing, no
MIME sniffing, and a CSP that allows only same-origin code plus the image
hosts the imported blog content still points at.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Historic blog covers and author photos are still served from Sanity's CDN.
IMAGE_SOURCES = "'self' data: blob: https://cdn.sanity.io https://ieee.iiitd.edu.in"

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        f"img-src {IMAGE_SOURCES}",
        "font-src 'self' data:",
        # Vite emits a hashed bundle; styles need 'unsafe-inline' because
        # motion animates element style attributes directly.
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
        "manifest-src 'self'",
    ]
)

STATIC_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, enable_hsts: bool = False, enable_csp: bool = True) -> None:
        super().__init__(app)
        self.enable_hsts = enable_hsts
        self.enable_csp = enable_csp

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        for header, value in STATIC_HEADERS.items():
            response.headers.setdefault(header, value)

        if self.enable_csp:
            response.headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)

        # Only meaningful over TLS, and only safe to send in production where
        # the deployment terminates HTTPS.
        if self.enable_hsts:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )

        return response
