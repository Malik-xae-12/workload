from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db.base import Base


class ErrorAuditLog(Base):
    """Every error surfaced by the API — from any module, any endpoint —
    lands here. This is the single place to look up what actually
    happened when something failed, independent of the friendly message
    the person saw in the UI (see app.core.exceptions / friendlyError.ts
    on the frontend for the message-cleanup side of this).

    Written by the global exception handler in app.core.exceptions, so
    individual endpoints/services never need to remember to log errors
    themselves — this is unconditional for every unhandled exception and
    every HTTPException with status >= 400.
    """

    __tablename__ = "error_audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Who / where — all nullable since an error can happen before auth
    # resolves, outside any project context, etc.
    user_id = Column(String(36), ForeignKey("user.id"), nullable=True, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    request_id = Column(String(64), nullable=True, index=True)

    method = Column(String(10), nullable=True)
    path = Column(String(512), nullable=True, index=True)
    status_code = Column(Integer, nullable=True, index=True)

    # error_type: the exception class name (or "HTTPException") — good for
    # grouping/counting recurring issues without reading the full message.
    error_type = Column(String(255), nullable=True, index=True)
    # error_message: the RAW detail — whatever the exception/HTTPException
    # actually said, unmodified. This is deliberately NOT what the customer
    # sees; see friendlyError.ts for that side.
    error_message = Column(Text, nullable=True)
    traceback = Column(Text, nullable=True)

    user = relationship("User", foreign_keys=[user_id])