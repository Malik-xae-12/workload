from uuid import uuid4

from sqlalchemy import Column, Boolean, ForeignKey, String
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin, SoftDeleteMixin


class MetadataConfig(Base, AuditMixin, SoftDeleteMixin):
    """Stores metadata warehouse creation details per project."""

    __tablename__ = "metadata_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    warehouse_id = Column(String(255), nullable=True)
    warehouse_name = Column(String(255), nullable=False, default="WH_MetaData")
    metadata_created = Column(Boolean, default=False, nullable=False)
    log_created = Column(Boolean, default=False, nullable=False)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, unique=True, index=True)

    project = relationship("Project", back_populates="metadata_config")
