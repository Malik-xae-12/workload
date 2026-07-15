"""
Simple double-submit CSRF protection middleware.

Generates a random CSRF token and sets it as a non-httpOnly cookie (`csrfToken`).
State-changing requests (POST, PUT, PATCH, DELETE) must include the same value
in the `X-CSRF-Token` header. Safe routes (login, register, etc.) are exempted.
"""

import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
EXEMPT_PATHS = {
    "/auth/jwt/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/entra-id/exchange",
    "/docs",
    "/openapi.json",
    "/redoc",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip CSRF if no secret configured (dev convenience)
        if not settings.CSRF_SECRET:
            return await call_next(request)

        csrf_cookie = request.cookies.get("csrfToken")

        # If no CSRF cookie, generate one
        if not csrf_cookie:
            csrf_cookie = secrets.token_urlsafe(32)

        # Check CSRF for state-changing methods
        if request.method not in SAFE_METHODS:
            path = request.url.path
            if not any(path.startswith(p) for p in EXEMPT_PATHS):
                header_token = request.headers.get("X-CSRF-Token", "")
                if not csrf_cookie or header_token != csrf_cookie:
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF token missing or invalid"},
                    )

        response = await call_next(request)

        # Always set the CSRF cookie (readable by JS)
        response.set_cookie(
            key="csrfToken",
            value=csrf_cookie,
            httponly=False,
            secure=settings.FRONTEND_URL.startswith("https"),
            samesite="lax",
            path="/",
        )

        return response
