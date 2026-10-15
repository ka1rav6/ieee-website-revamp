"""Security response headers.

The site serves its own frontend, so the policy can be strict: no framing, no
MIME sniffing, and a CSP that allows only same-origin code plus the image
hosts the imported blog content still points at.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette import status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Every image, including the content imported from the previous site, is
# served from this origin, so no external image host needs allowing.
IMAGE_SOURCES = "'self' data: blob:"

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


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Refuse a request body larger than the cap, before it is read.

    Starlette buffers the whole body before validation, so without this an
    oversized POST is a cheap way to exhaust memory. Only a declared
    Content-Length is checked; a request that omits one is bounded by the
    server, and the upload endpoint separately caps the bytes it reads.
    """

    def __init__(self, app, *, max_bytes: int) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        declared = request.headers.get("content-length")
        if declared is not None:
            try:
                length = int(declared)
            except ValueError:
                return self._reject(status.HTTP_400_BAD_REQUEST, "Invalid Content-Length header.")
            if length > self.max_bytes:
                return self._reject(status.HTTP_413_CONTENT_TOO_LARGE, "Request body is too large.")
        return await call_next(request)

    @staticmethod
    def _reject(code: int, detail: str) -> JSONResponse:
        # The security-headers middleware sits inside this one and is skipped
        # by the short-circuit, so set those headers here as well.
        return JSONResponse({"detail": detail}, status_code=code, headers=STATIC_HEADERS)


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
