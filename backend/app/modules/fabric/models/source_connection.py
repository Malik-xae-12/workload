from uuid import uuid4

from sqlalchemy import Column, Boolean, ForeignKey, String

from app.db.base import Base
from app.db.mixins import AuditMixin, SoftDeleteMixin


class SourceConnection(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "source_connections"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    conn_name = Column(String(255), nullable=False)
    db_type = Column(String(50), nullable=False)
    server = Column(String(255), nullable=False)
    database = Column(String(255), nullable=True)
    username = Column(String(255), nullable=False)
    password = Column(String(500), nullable=False)
    is_on_prem = Column(Boolean, default=False, nullable=False)
    gateway_name = Column(String(255), nullable=True)
    fabric_connection_id = Column(String(255), nullable=True)
    # 'creating' the instant the row is inserted (before the slow Fabric API
    # call even starts), then 'active' or 'failed' once it resolves. Lets the
    # connections list show "being created" immediately and survive a page
    # reload mid-creation, instead of the connection only appearing once the
    # whole request finishes (or vanishing if the page was reloaded first).
    status = Column(String(20), default="creating", nullable=False)
    status_error = Column(String(1000), nullable=True)
    # Finin-only: set True once this connection's AI Mapping results have been
    # saved to [Config_<connection_name>].[SourceInformationSchemaMapped].
    # Persisted (rather than kept in frontend state only) so the "Go to AI
    # Mapping" prompt stays hidden across page reloads, not just for the
    # current browser session.
    ai_mapping_saved = Column(Boolean, default=False, nullable=False)
    user_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)