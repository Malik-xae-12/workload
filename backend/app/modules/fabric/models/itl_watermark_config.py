from uuid import uuid4

from sqlalchemy import Column, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin


class ItlWatermarkConfig(Base, AuditMixin):
    """Stores uploaded ITL watermark configuration (parsed from Excel) per project + connection."""

    __tablename__ = "itl_watermark_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    connection_name = Column(String(255), nullable=False)
    config_json = Column(Text, nullable=False)  # JSON string of the parsed rows
    onelake_path = Column(String(1024), nullable=True)  # abfss:// path in Bronze/Files/MetaData_ITL/

    project = relationship("Project")