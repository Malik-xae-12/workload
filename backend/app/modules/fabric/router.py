"""Fabric API router – thin layer delegating to service functions."""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.modules.users.models.user import User
from app.db.session import get_async_session
from app.modules.auth.service import fastapi_users
from app.modules.fabric import service as svc
from app.modules.fabric.schema import (
    ConfigUploadRead,
    ConnectionNameCheckResponse,
    ConnectionTablesUpdateRequest,
    FabricCredentialCreate,
    FabricCredentialRead,
    ITLConfigStatusResponse,
    LinkSourceConnectionRequest,
    ListDatabasesRequest,
    ListDatabasesResponse,
    MedallionConfigCreate,
    MedallionConfigRead,
    MetadataActionRequest,
    MetadataConfigRead,
    NotebookJobStatusResponse,
    NotebookUploadRequest,
    NotebookRunRequest,
    NotebookRunResponse,
    PipelineJobStatusResponse,
    PipelineRunRequest,
    SourceTableRead,
    PendingTableSelectionRequest,
    PipelineRunResponse,
    PipelineUploadRequest,
    ProjectCreate,
    ProjectRead,
    ProjectSourceConnectionRead,
    RunStatusUpdate,
    ExecuteMasterSpRequest,
    SemanticModelUploadRead,
    SourceConnectionCreate,
    SourceConnectionRead,
    WorkspacePipelineRead,
    WorkspaceProvisionRequest,
    WorkspaceProvisionResponse,
)
from app.modules.fabric.services.notebook import list_local_notebooks, get_notebooks_for_db_type
from app.modules.fabric.services.pipeline import list_local_pipelines, get_pipelines_for_db_type
from app.modules.fabric.services.connection import list_gateways

router = APIRouter(tags=["fabric"])

current_active_user = fastapi_users.current_user(active=True)


# ── Projects ─────────────────────────────────────────────────────────


@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(
    app_type: str = "fabric",
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.list_projects(user, db, app_type=app_type)


@router.get("/projects/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.get_project_handler(project_id, user, db)


@router.post("/projects", response_model=ProjectRead, status_code=201)
async def create_project(
    payload: ProjectCreate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.create_project_handler(payload, user, db)


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.delete_project_handler(project_id, user, db)


# ── Fabric Credentials ───────────────────────────────────────────────


@router.post(
    "/projects/{project_id}/credentials",
    response_model=FabricCredentialRead,
    status_code=201,
)
async def save_credentials(
    project_id: str,
    payload: FabricCredentialCreate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.save_fabric_credential_handler(project_id, payload, user, db)


@router.get(
    "/projects/{project_id}/credentials",
    response_model=FabricCredentialRead,
)
async def get_credentials(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.get_fabric_credential_handler(project_id, user, db)


# ── Workspace Provisioning ──────────────────────────────────────────


@router.post(
    "/projects/{project_id}/provision-workspace",
    response_model=WorkspaceProvisionResponse,
    status_code=201,
)
async def provision_workspace(
    project_id: str,
    payload: WorkspaceProvisionRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.provision_workspace_handler(project_id, payload, user, db)


# ── Source Connections (global per user) ─────────────────────────────


@router.post("/source-connections", response_model=SourceConnectionRead)
async def create_connection(
    payload: SourceConnectionCreate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.create_source_connection_handler(payload, user, db)


@router.get("/source-connections", response_model=list[SourceConnectionRead])
async def list_connections(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.list_source_connections(user, db)


@router.get(
    "/projects/{project_id}/source-connections/check-name",
    response_model=ConnectionNameCheckResponse,
)
async def check_connection_name(
    project_id: str,
    name: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Live availability check for the Connection Name field — called on
    every keystroke (debounced client-side) so the person sees a
    tick/cross while typing instead of only discovering a clash after
    filling in the whole form and submitting."""
    return await svc.check_connection_name_handler(project_id, name, user, db)


@router.post(
    "/source-connections/list-databases",
    response_model=ListDatabasesResponse,
)
async def list_databases(
    payload: ListDatabasesRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Enumerate databases on a server for the Database Name searchable
    dropdown. Credentials are used only for this one lookup — never
    persisted here (the actual connection save still goes through the
    normal /source-connections POST)."""
    return await svc.list_databases_handler(payload, user, db)


# ── Project ↔ Source Connection links ────────────────────────────────


@router.post(
    "/projects/{project_id}/source-connections",
    response_model=ProjectSourceConnectionRead,
    status_code=201,
)
async def link_source_connection(
    project_id: str,
    payload: LinkSourceConnectionRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.link_source_connection(project_id, payload, user, db)


@router.get(
    "/projects/{project_id}/source-connections",
    response_model=list[ProjectSourceConnectionRead],
)
async def list_project_connections(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.list_project_connections(project_id, user, db)


@router.delete("/projects/{project_id}/source-connections/{link_id}")
async def unlink_source_connection(
    project_id: str,
    link_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.unlink_source_connection(project_id, link_id, user, db)


# ── Medallion Architecture ──────────────────────────────────────────


@router.post("/projects/{project_id}/medallion", response_model=MedallionConfigRead)
async def create_medallion(
    project_id: str,
    payload: MedallionConfigCreate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.create_medallion(project_id, payload, user, db)


@router.get("/projects/{project_id}/medallion", response_model=list[MedallionConfigRead])
async def list_medallion_configs(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.list_medallion_configs(project_id, user, db)


# ── Metadata / Log ──────────────────────────────────────────────────


@router.post("/projects/{project_id}/metadata")
async def create_metadata(
    project_id: str,
    payload: MetadataActionRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.create_metadata(project_id, payload, user, db)


@router.get("/projects/{project_id}/metadata-config", response_model=MetadataConfigRead)
async def get_metadata_config(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Get the metadata config (warehouse_id, status) for a project."""
    from app.modules.fabric import repository as repo

    await svc._require_project(project_id, user, db)
    mc = await repo.get_metadata_config(db, project_id)
    if not mc:
        raise HTTPException(status_code=404, detail="Metadata config not found for this project")
    return mc


# ── Notebooks ────────────────────────────────────────────────────────


@router.get("/notebooks")
async def list_notebooks(db_type: str | None = Query(None)):
    all_notebooks = list_local_notebooks()
    if not db_type:
        # Default to SQL notebooks when no type specified
        db_type = "Azure SQL"
    # Use explicit file map to return only relevant notebooks for this db type
    allowed_filenames = set(get_notebooks_for_db_type(db_type))
    return [nb for nb in all_notebooks if nb["filename"] in allowed_filenames]

# ── Source table selection (source -> Bronze) ───────────────────────


@router.get("/projects/{project_id}/connections/{connection_name}/tables", response_model=list[SourceTableRead])
async def list_connection_tables(
    project_id: str,
    connection_name: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """List every table discovered for this source connection, with its
    current IsActive (source -> Bronze) state."""
    return await svc.list_connection_tables(project_id, connection_name, user, db)


@router.put("/projects/{project_id}/connections/{connection_name}/tables")
async def update_connection_tables(
    project_id: str,
    connection_name: str,
    payload: ConnectionTablesUpdateRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Set exactly which tables for this connection are active (move to
    Bronze) -- everything else is set inactive."""
    return await svc.update_connection_tables(project_id, connection_name, payload.active_ids, user, db)


@router.get("/connections/{connection_id}/pending-schemas")
async def list_pending_source_schemas(
    connection_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Distinct schema names available directly on the source database
    (excluding 'sys'), for the SchemaWise selection mode."""
    return await svc.list_pending_source_schemas(connection_id, user, db)


@router.get("/connections/{connection_id}/pending-tables")
async def list_pending_source_tables(
    connection_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """List tables directly from the source database itself, for picking
    tables BEFORE this connection's config-creation notebook has run."""
    return await svc.list_pending_source_tables(connection_id, user, db)


@router.put("/connections/{connection_id}/pending-tables")
async def save_pending_source_table_selection(
    connection_id: str,
    payload: PendingTableSelectionRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Save the table-selection mode ('all' | 'schema' | 'table') and the
    corresponding picks, to be applied once the notebook eventually
    creates the real (Fabric-side) config table for this connection."""
    return await svc.save_pending_source_table_selection(
        connection_id, payload.mode, payload.schemas, payload.selected, user, db
    )


@router.post("/projects/{project_id}/notebooks/upload")
async def upload_notebooks_to_fabric(
    project_id: str,
    payload: NotebookUploadRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.upload_notebooks_handler(project_id, payload, user, db)


# ── Pipelines ────────────────────────────────────────────────────────


@router.get("/pipelines")
async def list_pipelines(db_type: str | None = Query(None)):
    all_pipelines = list_local_pipelines()
    if not db_type:
        # Default to SQL pipelines when no type specified
        db_type = "Azure SQL"
    # Use explicit file map to return only relevant pipelines for this db type
    allowed_filenames = set(get_pipelines_for_db_type(db_type))
    return [pl for pl in all_pipelines if pl["filename"] in allowed_filenames]


@router.post("/projects/{project_id}/pipelines/upload")
async def upload_pipelines_to_fabric(
    project_id: str,
    payload: PipelineUploadRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.upload_pipelines_handler(project_id, payload, user, db)


@router.post("/projects/{project_id}/pipelines/upload-itl")
async def upload_itl_pipelines_to_fabric(
    project_id: str,
    payload: PipelineUploadRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.upload_itl_pipelines_handler(project_id, payload, user, db)


# ── Config Upload Status ─────────────────────────────────────────────


@router.get(
    "/projects/{project_id}/upload-status",
    response_model=list[ConfigUploadRead],
)
async def get_upload_status(
    project_id: str,
    source_connection_id: str | None = Query(None),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.get_upload_status_handler(project_id, user, db, source_connection_id)

@router.post("/projects/{project_id}/blob-config/upload")
async def upload_blob_config(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.upload_blob_config_handler(project_id, user, db)


# ── Pipeline Run / Status ────────────────────────────────────────────


@router.get(
    "/projects/{project_id}/workspace-pipelines",
    response_model=list[WorkspacePipelineRead],
)
async def list_workspace_pipelines(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.list_workspace_pipelines_handler(project_id, user, db)


@router.post(
    "/projects/{project_id}/pipelines/{pipeline_item_id}/run",
    response_model=PipelineRunResponse,
)
async def run_pipeline(
    project_id: str,
    pipeline_item_id: str,
    payload: PipelineRunRequest | None = None,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.run_pipeline_handler(
        project_id, pipeline_item_id, payload or PipelineRunRequest(), user, db
    )


@router.get(
    "/projects/{project_id}/pipelines/{pipeline_item_id}/jobs/{job_id}",
    response_model=PipelineJobStatusResponse,
)
async def get_pipeline_job_status(
    project_id: str,
    pipeline_item_id: str,
    job_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.get_pipeline_job_status_handler(
        project_id, pipeline_item_id, job_id, user, db
    )


@router.get(
    "/projects/{project_id}/pipelines/{pipeline_item_id}/latest-status",
)
async def get_latest_item_job_status(
    project_id: str,
    pipeline_item_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Latest job instance status for an item, regardless of who triggered
    it — used to poll child pipelines invoked internally by a parent/master
    pipeline (we never have a job_id for those ourselves)."""
    return await svc.get_latest_item_job_status_handler(
        project_id, pipeline_item_id, user, db
    )


@router.patch(
    "/projects/{project_id}/upload-status",
    response_model=ConfigUploadRead,
)
async def update_run_status(
    project_id: str,
    payload: RunStatusUpdate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await svc.update_run_status_handler(project_id, payload, user, db)


@router.post("/projects/{project_id}/sync-pipeline-status")
async def sync_pipeline_status(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Check Fabric API for actual status of any 'running' pipelines and update DB."""
    return await svc.sync_pipeline_status_handler(project_id, user, db)


# ── ITL Config (Download / Upload Excel) ─────────────────────────────


@router.get("/projects/{project_id}/itl-config/download")
async def download_itl_config(
    project_id: str,
    connection_name: str = Query(...),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Download OTL config as Excel with extra watermark columns for user to fill."""
    excel_bytes = await svc.download_itl_config_handler(project_id, connection_name, user, db)
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=ITL_Config_{connection_name}.xlsx"},
    )


@router.post("/projects/{project_id}/itl-config/upload")
async def upload_itl_config(
    project_id: str,
    connection_name: str = Query(...),
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Upload filled watermark Excel to prepare ITL config creation."""
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx)")
    file_bytes = await file.read()
    return await svc.upload_itl_config_handler(
        project_id, connection_name, file_bytes, user, db, original_filename=file.filename
    )

@router.get(
    "/projects/{project_id}/itl-config/status",
    response_model=ITLConfigStatusResponse
)
async def get_itl_config_status(
    project_id: str,
    connection_name: str = Query(...),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Return whether ITL config has been downloaded/uploaded for a connection,
    plus the persisted notebook run status and any previously-deployed ITL pipelines
    (so the UI can restore completed state after a page refresh)."""
    from app.modules.fabric.models.itl_watermark_config import ItlWatermarkConfig
    from app.modules.fabric.models.config_upload import ConfigUpload
    from sqlalchemy import select as _select

    result = await db.execute(
        _select(ItlWatermarkConfig).where(
            ItlWatermarkConfig.project_id == project_id,
            ItlWatermarkConfig.connection_name == connection_name,
        )
    )
    cfg = result.scalar_one_or_none()

    nb_result = await db.execute(
        _select(ConfigUpload).where(
            ConfigUpload.project_id == project_id,
            ConfigUpload.item_type == "itl_notebook",
            ConfigUpload.item_name == f"{connection_name}_01_NB_IncrementalConfigCreation",
        )
    )
    nb_upload = nb_result.scalar_one_or_none()

    # ITL pipelines are saved with item_type="pipeline" and names prefixed with
    # "{connection_name}_" (e.g. "{connection_name}_01_PL_WatermarkUpdate").
    # These must match the pipeline JSON's own "name" field exactly (see
    # upload_itl_pipelines) — including the "NN_PL_" numbering and the literal
    # space in "Master pipeline" — or every deployed ITL pipeline is silently
    # filtered out here and reported back to the frontend as never deployed.
    _ITL_SUFFIXES = {
        "04_PL_IncrementalSourceToBronze", "05_PL_SourceDelete", "01_PL_WatermarkUpdate",
        "06_PL_MailTrigger", "03_PL_InvokePipeline", "02_PL_Master pipeline",
    }
    prefix = f"{connection_name}_"
    pipe_result = await db.execute(
        _select(ConfigUpload).where(
            ConfigUpload.project_id == project_id,
            ConfigUpload.item_type == "pipeline",
            ConfigUpload.item_name.like(f"{prefix}%"),
        )
    )
    deployed_pipelines = [
        {
            "name": u.item_name,
            "status": u.status,
            "fabric_item_id": u.fabric_item_id,
            "run_status": u.run_status,
            "job_id": u.job_id,
        }
        for u in pipe_result.scalars().all()
        if u.item_name[len(prefix):] in _ITL_SUFFIXES
    ]

    return {
        "downloaded": cfg is not None,
        "uploaded": cfg is not None and cfg.config_json not in (None, "[]", ""),
        "onelake_path": cfg.onelake_path if cfg else None,
        "original_filename": cfg.original_filename if cfg else None,
        "notebook_run_status": nb_upload.run_status if nb_upload else None,
        "notebook_job_id": nb_upload.job_id if nb_upload else None,
        "deployed_pipelines": deployed_pipelines,
    }

@router.post(
    "/projects/{project_id}/itl-notebook/run",
    response_model=NotebookRunResponse,
)
async def run_itl_notebook(
    project_id: str,
    payload: NotebookRunRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Run an ITL notebook in the Fabric workspace."""
    notebook_name = payload.notebook_name or "01_NB_IncrementalConfigCreation"
    return await svc.run_itl_notebook_handler(project_id, notebook_name, user, db)


@router.post("/projects/{project_id}/gold/deploy-stored-procedures")
async def deploy_gold_stored_procedures(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Start deploying the bundled ims-schema stored procedure script against
    WH_Gold as a background job — returns immediately with a job_id; poll
    /gold/deploy-stored-procedures-status/{job_id} for live batch progress.
    Available once ITL is complete for at least one connection."""
    return await svc.start_deploy_gold_stored_procedures_handler(project_id, user, db)


@router.get("/projects/{project_id}/gold/deploy-stored-procedures-status/{job_id}")
async def deploy_gold_stored_procedures_status(
    project_id: str,
    job_id: str,
    user: User = Depends(current_active_user),
):
    """Poll for live progress of a background gold stored-procedure deploy."""
    return svc.get_deploy_gold_stored_procedures_status(job_id)


@router.post("/projects/{project_id}/gold/deploy-master-executor")
async def deploy_master_executor(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Create [MasterExecuter].[sp_GoldExecute] (+ schema/log table) in WH_Gold.
    Small script, runs synchronously — no job/progress needed for this part."""
    return await svc.deploy_master_executer_handler(project_id, user, db)


@router.post("/projects/{project_id}/gold/execute-master-sp")
async def execute_master_sp(
    project_id: str,
    payload: ExecuteMasterSpRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Start EXEC [MasterExecuter].[sp_GoldExecute] as a background job — the
    procedure runs every active stored procedure from
    Config_Gold.finin_gold_sp_details. Returns immediately with a job_id; poll
    /gold/execute-master-sp-status/{job_id} for live per-SP progress."""
    return await svc.start_execute_master_sp_handler(
        project_id, payload.silver_lakehouse, user, db
    )


@router.get("/projects/{project_id}/gold/execute-master-sp-status/{job_id}")
async def execute_master_sp_status(
    project_id: str,
    job_id: str,
    user: User = Depends(current_active_user),
):
    """Poll for live progress of a background Master SP execution."""
    return svc.get_execute_master_sp_status(job_id)


# ── Semantic Model (Finin) ──────────────────────────────────────────


@router.post(
    "/projects/{project_id}/semantic-model/upload-excel",
    response_model=SemanticModelUploadRead,
)
async def upload_semantic_model_excel(
    project_id: str,
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Upload the Tables/Relationships/Measures workbook — parses and
    persists it, ready for /semantic-model/build to pick up."""
    file_bytes = await file.read()
    return await svc.upload_semantic_model_excel_handler(
        project_id, file_bytes, file.filename or "semantic_model.xlsx", user, db
    )


@router.get("/projects/{project_id}/semantic-model/status")
async def get_semantic_model_status(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Restore Config-page state after a reload: last uploaded Excel (if
    any) and the last known build status/result."""
    return await svc.get_semantic_model_status_handler(project_id, user, db)


@router.post("/projects/{project_id}/semantic-model/build")
async def build_semantic_model(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Start building the semantic model as a background job — returns
    immediately with a job_id; poll /semantic-model/build-status/{job_id}."""
    return await svc.start_build_semantic_model_handler(project_id, user, db)


@router.get("/projects/{project_id}/semantic-model/build-status/{job_id}")
async def build_semantic_model_status(
    project_id: str,
    job_id: str,
    user: User = Depends(current_active_user),
):
    """Poll for live progress of a background semantic-model build."""
    return svc.get_build_semantic_model_status(job_id)


@router.get(
    "/projects/{project_id}/itl-notebook/{notebook_name}/jobs/{job_id}",
    response_model=NotebookJobStatusResponse,
)
async def get_itl_notebook_status(
    project_id: str,
    notebook_name: str,
    job_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Get the status of an ITL notebook job."""
    return await svc.get_itl_notebook_status_handler(
        project_id, notebook_name, job_id, user, db
    )


# ── Gateways ─────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/gateways")
async def list_gateways_endpoint(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    token, _ = await svc._get_project_token(project_id, db)
    try:
        return list_gateways(token)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

# ── Blob Structure Discovery ─────────────────────────────────────────


@router.post("/blob/discover")
async def discover_blob_structure(
    prefix: str = Query("Data/", description="Blob prefix to scan"),
    archive_root: str = Query("Archive/", description="Archive root path"),
    user: User = Depends(current_active_user),
):
    """Scan Azure Blob Storage and return the discovered folder/file structure."""
    config = await svc.discover_blob_structure_handler(
        prefix=prefix,
        archive_root=archive_root,
    )
    return config


# ── Helpers ──────────────────────────────────────────────────────────


def _filter_items_by_source(items: list[dict], db_type: str) -> list[dict]:
    """Filter notebooks/pipelines by source type.

    Items containing 'Oracle' in their name are Oracle-specific.
    Items containing 'SQLServer' in their name are SQL Server-specific.
    Items not matching either pattern are common (shown for all).
    """
    db_lower = db_type.lower()
    is_oracle = "oracle" in db_lower
    is_sqlserver = "sql" in db_lower  # covers "SQL Server", "Azure SQL"

    filtered = []
    for item in items:
        name = item["name"].lower()
        if "oracle" in name:
            if is_oracle:
                filtered.append(item)
        elif "sqlserver" in name:
            if is_sqlserver:
                filtered.append(item)
        else:
            # Common items (no source-specific keyword) shown for all
            filtered.append(item)
    return filtered