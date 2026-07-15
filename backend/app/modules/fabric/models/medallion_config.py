from uuid import uuid4

from sqlalchemy import Column, Boolean, ForeignKey, String
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin, SoftDeleteMixin


class MedallionConfig(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "medallion_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    bronze_is_lakehouse = Column(Boolean, default=True, nullable=False)
    silver_is_lakehouse = Column(Boolean, default=True, nullable=False)
    gold_is_lakehouse = Column(Boolean, default=False, nullable=False)
    schema_enabled = Column(Boolean, default=False, nullable=False)
    bronze_name = Column(String(255), default="Bronze_Layer", nullable=False)
    silver_name = Column(String(255), default="Silver_Layer", nullable=False)
    gold_name = Column(String(255), default="Gold_Layer", nullable=False)
    bronze_item_id = Column(String(255), nullable=True)
    silver_item_id = Column(String(255), nullable=True)
    gold_item_id = Column(String(255), nullable=True)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, unique=True, index=True)

    project = relationship("Project", back_populates="medallion_config")
