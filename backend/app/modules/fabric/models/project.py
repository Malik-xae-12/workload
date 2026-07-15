from uuid import uuid4

from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin, SoftDeleteMixin


class Project(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    user_id = Column(String(36), ForeignKey("user.id"), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="active")
    workspace_id = Column(String(255), nullable=True)
    workspace_name = Column(String(255), nullable=True)

    # 'fabric' or 'finin' — which accelerator this project belongs to. Projects
    # are fully isolated per accelerator: a project created under one never
    # appears when browsing the other, even though they share the same table.
    app_type = Column(String(20), nullable=False, default="fabric", server_default="fabric")

    # Relationships
    medallion_config = relationship(
        "MedallionConfig", back_populates="project", uselist=False, lazy="selectin",
    )
    source_links = relationship(
        "ProjectSourceConnection", back_populates="project", lazy="selectin",
    )
    metadata_config = relationship(
        "MetadataConfig", back_populates="project", uselist=False, lazy="selectin",
    )
    credential = relationship(
        "FabricCredential", back_populates="project", uselist=False, lazy="selectin",
    )
