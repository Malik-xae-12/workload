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
    user_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
