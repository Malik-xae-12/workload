from uuid import uuid4

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin


class ProjectSourceConnection(Base, AuditMixin):
    """Junction table linking projects to global source connections."""

    __tablename__ = "project_source_connections"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    source_connection_id = Column(String(36), ForeignKey("source_connections.id"), nullable=False, index=True)
    connection_index = Column(Integer, nullable=False, default=1)

    project = relationship("Project", back_populates="source_links")
    source_connection = relationship("SourceConnection", lazy="selectin")
