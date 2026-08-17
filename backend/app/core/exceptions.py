import logging
import traceback as tb_module
import uuid
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.friendly_errors import to_friendly_message

logger = logging.getLogger("app.errors")


def _get_user_id(request: Request):
    # Set by auth dependencies on `request.state` where available; best-effort
    # only — logging must never fail just because auth hasn't resolved yet.
    return getattr(getattr(request, "state", None), "user_id", None)


async def _write_audit_log(
    request: Request,
    *,
    status_code: int,
    error_type: str,
    error_message: str,
    traceback_text: Optional[str],
) -> None:
    """Best-effort: an audit-log write failing must never prevent the
    actual error response from reaching the client, so every exception
    here is swallowed after logging to stderr.
    """
    try:
        from app.core.models import ErrorAuditLog
        from app.db.session import async_session_maker

        project_id = request.path_params.get("project_id") if request.path_params else None

        async with async_session_maker() as session:
            session.add(
                ErrorAuditLog(
                    id=str(uuid.uuid4()),
                    user_id=_get_user_id(request),
                    project_id=project_id,
                    request_id=request.headers.get("x-request-id"),
                    method=request.method,
                    path=request.url.path,
                    status_code=status_code,
                    error_type=error_type,
                    error_message=(error_message or "")[:8000],
                    traceback=(traceback_text[:20000] if traceback_text else None),
                )
            )
            await session.commit()
    except Exception:
        logger.exception("Failed to write error audit log (non-fatal)")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException):
        raw_detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)

        if exc.status_code >= 400:
            await _write_audit_log(
                request,
                status_code=exc.status_code,
                error_type="HTTPException",
                error_message=raw_detail,
                traceback_text=None,
            )

        friendly = to_friendly_message(raw_detail, exc.status_code)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": friendly},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        # Build a short, readable summary ("email: field required") instead
        # of surfacing pydantic's raw error list — that's meant for API
        # consumers/logs, not end users.
        parts = []
        for err in exc.errors()[:5]:
            loc = ".".join(str(p) for p in err.get("loc", []) if p != "body")
            parts.append(f"{loc}: {err.get('msg', 'invalid value')}" if loc else err.get("msg", "invalid value"))
        raw_detail = "; ".join(parts) or "Invalid request."

        await _write_audit_log(
            request,
            status_code=422,
            error_type="RequestValidationError",
            error_message=str(exc.errors())[:4000],
            traceback_text=None,
        )

        return JSONResponse(
            status_code=422,
            content={"detail": f"Please check the following: {raw_detail}"},
        )

    @app.exception_handler(Exception)
    async def handle_unhandled_exception(request: Request, exc: Exception):
        # Unhandled = genuinely unexpected — always technical, never shown
        # raw to the customer, but always logged in full (including
        # traceback) so it's actually debuggable afterward.
        traceback_text = "".join(tb_module.format_exception(type(exc), exc, exc.__traceback__))
        logger.error("Unhandled exception on %s %s\n%s", request.method, request.url.path, traceback_text)

        await _write_audit_log(
            request,
            status_code=500,
            error_type=type(exc).__name__,
            error_message=str(exc),
            traceback_text=traceback_text,
        )

        return JSONResponse(
            status_code=500,
            content={"detail": to_friendly_message(None, 500)},
        )