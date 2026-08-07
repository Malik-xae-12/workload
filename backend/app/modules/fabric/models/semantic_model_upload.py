from uuid import uuid4

from sqlalchemy import Column, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin


class SemanticModelUpload(Base, AuditMixin):
    """Stores the parsed semantic-model Excel (table/schema names,
    relationships, measures) uploaded on the Config page, per project.

    One row per project — re-uploading replaces the previous parse, the same
    way ItlWatermarkConfig works for the ITL watermark Excel.
    """

    __tablename__ = "semantic_model_uploads"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True, unique=True)
    filename = Column(String(255), nullable=False)
    tables_json = Column(Text, nullable=False)          # JSON: [{"schema_name":..,"table_name":..}]
    relationships_json = Column(Text, nullable=False)    # JSON: [{...}]
    measures_json = Column(Text, nullable=False)         # JSON: [{...}]

    project = relationship("Project")