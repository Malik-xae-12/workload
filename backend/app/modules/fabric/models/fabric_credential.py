from uuid import uuid4

from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin, SoftDeleteMixin


class FabricCredential(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "fabric_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    client_id = Column(String(255), nullable=False)
    tenant_id = Column(String(255), nullable=False)
    client_secret = Column(String(500), nullable=False)
    capacity_id = Column(String(255), nullable=False)
    workspace_id = Column(String(255), nullable=True)
    user_object_id = Column(String(255), nullable=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, unique=True, index=True)

    project = relationship("Project", back_populates="credential")
