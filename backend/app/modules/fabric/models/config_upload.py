from uuid import uuid4

from sqlalchemy import Column, ForeignKey, Index, String
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.mixins import AuditMixin


class ConfigUpload(Base, AuditMixin):
    """Tracks notebook/pipeline upload status per project + source connection."""

    __tablename__ = "config_uploads"
    __table_args__ = (
        # Every status fetch (getUploadStatus), upsert (save_config_upload) and
        # run-status patch (update_config_upload_run_status) filters on exactly
        # this triple — without a covering index each of those was a full
        # table scan of config_uploads.
        Index("ix_config_uploads_project_type_name", "project_id", "item_type", "item_name"),
        # Used by sync-pipeline-status / job lookups to find a row by the
        # Fabric item it was deployed as.
        Index("ix_config_uploads_fabric_item_id", "fabric_item_id"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    source_connection_id = Column(String(36), ForeignKey("source_connections.id"), nullable=True, index=True)
    item_type = Column(String(50), nullable=False, index=True) 
    item_name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="success") 
    fabric_item_id = Column(String(255), nullable=True) 
    run_status = Column(String(50), nullable=True) 
    job_id = Column(String(255), nullable=True) 

    project = relationship("Project")