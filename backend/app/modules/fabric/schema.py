from datetime import datetime

from pydantic import BaseModel


# ── Source Connection ────────────────────────────────────────────────

class SourceConnectionBase(BaseModel):
    conn_name: str
    db_type: str  # SQL Server, MySQL, Oracle, Postgres, Azure SQL
    server: str
    database: str | None = None
    username: str | None = None
    password: str | None = None
    is_on_prem: bool = False
    gateway_name: str | None = None
    auth_type: str = "Basic"  # Basic, ServicePrincipal, OAuth
    tenant_id: str | None = None
    client_id: str | None = None
    client_secret: str | None = None


class SourceConnectionCreate(SourceConnectionBase):
    pass


class SourceConnectionRead(BaseModel):
    id: str
    conn_name: str
    db_type: str
    server: str
    database: str | None = None
    is_on_prem: bool
    gateway_name: str | None = None
    fabric_connection_id: str | None = None
    user_id: str

    model_config = {"from_attributes": True}

    def model_post_init(self, __context) -> None:
        """Infer db_type from server if empty (legacy data)."""
        if not self.db_type and self.server:
            server_lower = self.server.lower()
            if ".database.windows.net" in server_lower:
                self.db_type = "Azure SQL"
            elif "oracle" in server_lower or ":1521" in server_lower:
                self.db_type = "Oracle"
            elif "postgres" in server_lower or ":5432" in server_lower:
                self.db_type = "PostgreSQL"
            elif "mysql" in server_lower or ":3306" in server_lower:
                self.db_type = "MySQL"
            else:
                self.db_type = "SQL Server"


# ── Medallion Config ────────────────────────────────────────────────

class MedallionConfigBase(BaseModel):
    bronze_is_lakehouse: bool = True
    silver_is_lakehouse: bool = True
    gold_is_lakehouse: bool = False
    schema_enabled: bool = True
    bronze_name: str = "Bronze_Layer"
    silver_name: str = "Silver_Layer"
    gold_name: str = "Gold_Layer"


class MedallionConfigCreate(MedallionConfigBase):
    pass


class MedallionConfigRead(BaseModel):
    id: str
    bronze_is_lakehouse: bool
    silver_is_lakehouse: bool
    gold_is_lakehouse: bool
    schema_enabled: bool
    bronze_name: str
    silver_name: str
    gold_name: str
    bronze_item_id: str | None = None
    silver_item_id: str | None = None
    gold_item_id: str | None = None
    project_id: str

    model_config = {"from_attributes": True}


# ── Metadata / Log ──────────────────────────────────────────────────

class MetadataActionRequest(BaseModel):
    action: str = "create_metadata"  # "create_metadata" or "create_log"


# ── Notebooks ────────────────────────────────────────────────────────

class NotebookUploadRequest(BaseModel):
    connection_name: str
    connection_index: int = 1
    db_type: str = ""  # e.g. "SQL Server", "Oracle", "PostgreSQL", "MySQL"
    filenames: list[str] | None = None  # None = auto-select based on db_type
    app_mode: str = "fabric"  # 'fabric' or 'finin' — picks which notebook variant to deploy


# ── Pipelines ────────────────────────────────────────────────────────

class PipelineUploadRequest(BaseModel):
    connection_name: str
    connection_index: int = 1
    db_type: str = ""  # e.g. "SQL Server", "Oracle", "PostgreSQL", "MySQL"
    filenames: list[str] | None = None  # None = auto-select based on db_type
    load_type: str = ""  # From IncrementalConfigETL.LoadType (ITL only)
    app_mode: str = "fabric"  # 'fabric' or 'finin' — picks which pipeline variant to deploy


# ── Pipeline Run / Status ────────────────────────────────────────────

class WorkspacePipelineRead(BaseModel):
    id: str
    name: str


class PipelineRunRequest(BaseModel):
    parameters: dict | None = None
    job_type: str = "Pipeline"


class PipelineRunResponse(BaseModel):
    job_id: str
    pipeline_id: str
    status: str = "accepted"


class PipelineJobStatusResponse(BaseModel):
    job_id: str
    status: str  # completed, failed, error, cancelled, in_progress
    error: str | None = None


class NotebookRunRequest(BaseModel):
    notebook_name: str | None = None
    parameters: dict | None = None


class NotebookRunResponse(BaseModel):
    job_id: str
    notebook_id: str
    status: str = "accepted"


class NotebookJobStatusResponse(BaseModel):
    job_id: str
    status: str  # completed, failed, error, cancelled, in_progress
    error: str | None = None


class RunStatusUpdate(BaseModel):
    item_name: str
    item_type: str = "pipeline"
    run_status: str  # 'running', 'completed', 'failed'
    job_id: str | None = None


# ── Project Source Connection (link) ────────────────────────────────

class LinkSourceConnectionRequest(BaseModel):
    source_connection_id: str
    connection_index: int = 1


class ProjectSourceConnectionRead(BaseModel):
    id: str
    project_id: str
    source_connection_id: str
    connection_index: int
    source_connection: SourceConnectionRead | None = None

    model_config = {"from_attributes": True}


# ── Projects ────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    app_type: str = "fabric"  # 'fabric' or 'finin'


class ProjectRead(BaseModel):
    id: str
    name: str
    description: str | None = None
    user_id: str
    status: str
    workspace_id: str | None = None
    workspace_name: str | None = None
    app_type: str = "fabric"
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# ── Metadata Config ─────────────────────────────────────────────────

class MetadataConfigRead(BaseModel):
    id: str
    warehouse_id: str | None = None
    warehouse_name: str
    metadata_created: bool
    log_created: bool
    project_id: str

    model_config = {"from_attributes": True}


# ── Fabric Credentials ──────────────────────────────────────────────

class FabricCredentialCreate(BaseModel):
    client_id: str
    client_secret: str
    tenant_id: str
    capacity_id: str
    user_object_id: str | None = None


class FabricCredentialRead(BaseModel):
    id: str
    client_id: str
    tenant_id: str
    capacity_id: str
    user_object_id: str | None = None
    workspace_id: str | None = None
    project_id: str

    model_config = {"from_attributes": True}


# ── Workspace Provisioning ──────────────────────────────────────────

class WorkspaceProvisionRequest(BaseModel):
    workspace_name: str
    user_fabric_token: str | None = None


class WorkspaceProvisionResponse(BaseModel):
    workspace_id: str
    workspace_name: str
    sp_object_id: str
    capacity_assigned: bool = False
    status: str = "provisioned"

class ITLDeployedPipeline(BaseModel):
    name: str
    status: str
    fabric_item_id: str | None = None


class ITLConfigStatusResponse(BaseModel):
    downloaded: bool
    uploaded: bool
    onelake_path: str | None = None
    notebook_run_status: str | None = None
    notebook_job_id: str | None = None
    deployed_pipelines: list[ITLDeployedPipeline] = []


class ConfigUploadRead(BaseModel):
    id: str
    project_id: str
    source_connection_id: str | None = None
    item_type: str
    item_name: str
    status: str
    fabric_item_id: str | None = None
    run_status: str | None = None
    job_id: str | None = None

    model_config = {"from_attributes": True}