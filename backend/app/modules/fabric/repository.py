"""Database CRUD operations for the Fabric module."""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, noload

from app.modules.fabric.models.medallion_config import MedallionConfig
from app.modules.fabric.models.metadata_config import MetadataConfig
from app.modules.fabric.models.config_upload import ConfigUpload
from app.modules.fabric.models.itl_watermark_config import ItlWatermarkConfig
from app.modules.fabric.models.fabric_credential import FabricCredential
from app.modules.fabric.models.semantic_model_upload import SemanticModelUpload
from app.modules.fabric.models.project import Project
from app.modules.fabric.models.project_source_connection import ProjectSourceConnection
from app.modules.fabric.models.source_connection import SourceConnection


# ── Projects ─────────────────────────────────────────────────────────


async def get_project(db: AsyncSession, project_id: str, user_id: str) -> Project | None:
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.is_deleted == False,
        )
    )
    return result.scalars().first()


async def list_projects(db: AsyncSession, user_id: str, app_type: str = "fabric") -> list[Project]:
    result = await db.execute(
        select(Project)
        .where(Project.user_id == user_id, Project.is_deleted == False, Project.app_type == app_type)
        .order_by(Project.created_at.desc())
        .options(
            noload(Project.medallion_config),
            noload(Project.source_links),
            noload(Project.metadata_config),
            noload(Project.created_by),
        )
    )
    return result.scalars().all()


async def create_project(
    db: AsyncSession, *, name: str, description: str | None, user_id: str, app_type: str = "fabric"
) -> Project:
    project = Project(
        name=name, description=description, user_id=user_id, created_by_id=user_id, app_type=app_type
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def soft_delete_project(db: AsyncSession, project: Project) -> None:
    project.is_deleted = True
    await db.commit()


async def update_project_workspace(
    db: AsyncSession, project: Project, workspace_id: str, workspace_name: str, capacity_assigned: bool = False
) -> Project:
    project.workspace_id = workspace_id
    project.workspace_name = workspace_name
    # Only ever flip this on — a later provisioning call that happens to
    # come back with capacity_assigned=False (e.g. a transient capacity
    # API hiccup) must not erase a capacity assignment that already
    # succeeded once.
    if capacity_assigned:
        project.capacity_assigned = True
    await db.commit()
    await db.refresh(project)
    return project


async def get_any_user_project_with_workspace(db: AsyncSession, user_id: str) -> Project | None:
    result = await db.execute(
        select(Project).where(
            Project.user_id == user_id,
            Project.is_deleted == False,
            Project.workspace_id.isnot(None),
        )
    )
    return result.scalars().first()


# ── Source Connections (global per user) ─────────────────────────────


async def list_source_connections(db: AsyncSession, user_id: str) -> list[SourceConnection]:
    result = await db.execute(
        select(SourceConnection).where(SourceConnection.user_id == user_id)
    )
    return result.scalars().all()


async def get_source_connection(
    db: AsyncSession, sc_id: str, user_id: str
) -> SourceConnection | None:
    result = await db.execute(
        select(SourceConnection).where(
            SourceConnection.id == sc_id,
            SourceConnection.user_id == user_id,
        )
    )
    return result.scalars().first()


async def create_source_connection_record(
    db: AsyncSession,
    *,
    conn_name: str,
    db_type: str,
    server: str,
    database: str | None,
    username: str,
    password: str,
    is_on_prem: bool,
    gateway_name: str | None,
    fabric_connection_id: str | None,
    user_id: str,
    status: str = "active",
) -> SourceConnection:
    sc = SourceConnection(
        id=str(uuid4()),
        conn_name=conn_name,
        db_type=db_type,
        server=server,
        database=database,
        username=username,
        password=password,
        is_on_prem=is_on_prem,
        gateway_name=gateway_name,
        fabric_connection_id=fabric_connection_id,
        user_id=user_id,
        status=status,
    )
    db.add(sc)
    await db.commit()
    await db.refresh(sc)
    return sc


async def finalize_source_connection_status(
    db: AsyncSession,
    source_connection_id: str,
    *,
    status: str,
    fabric_connection_id: str | None = None,
    status_error: str | None = None,
) -> None:
    """Flip a connection from 'creating' to 'active'/'failed' once the (slow)
    Fabric API call it was waiting on resolves."""
    result = await db.execute(select(SourceConnection).where(SourceConnection.id == source_connection_id))
    sc = result.scalars().first()
    if sc is None:
        return
    sc.status = status
    if fabric_connection_id is not None:
        sc.fabric_connection_id = fabric_connection_id
    sc.status_error = status_error
    db.add(sc)
    await db.commit()


# ── Project ↔ Source Connection links ────────────────────────────────


async def create_project_link(
    db: AsyncSession,
    *,
    project_id: str,
    source_connection_id: str,
    connection_index: int,
) -> ProjectSourceConnection:
    # Idempotent: creating a connection now auto-links it server-side, and
    # the frontend still fires its own follow-up link call as a fallback for
    # older clients. Without this check, that follow-up created a SECOND
    # ProjectSourceConnection row for the same pair — the connection then
    # showed up twice in listProjectConnections (one row per link).
    existing = await db.execute(
        select(ProjectSourceConnection).where(
            ProjectSourceConnection.project_id == project_id,
            ProjectSourceConnection.source_connection_id == source_connection_id,
        )
    )
    found = existing.scalars().first()
    if found:
        return found

    link = ProjectSourceConnection(
        id=str(uuid4()),
        project_id=project_id,
        source_connection_id=source_connection_id,
        connection_index=connection_index,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


async def list_project_links(
    db: AsyncSession, project_id: str
) -> list[ProjectSourceConnection]:
    result = await db.execute(
        select(ProjectSourceConnection).where(
            ProjectSourceConnection.project_id == project_id
        )
    )
    return result.scalars().all()


async def get_project_link(
    db: AsyncSession, link_id: str, project_id: str
) -> ProjectSourceConnection | None:
    result = await db.execute(
        select(ProjectSourceConnection).where(
            ProjectSourceConnection.id == link_id,
            ProjectSourceConnection.project_id == project_id,
        )
    )
    return result.scalars().first()


async def delete_project_link(db: AsyncSession, link: ProjectSourceConnection) -> None:
    await db.delete(link)
    await db.commit()


async def find_project_connection_by_name(
    db: AsyncSession, project_id: str, conn_name: str
) -> SourceConnection | None:
    """Find a source connection linked to a project by connection name."""
    result = await db.execute(
        select(SourceConnection)
        .join(
            ProjectSourceConnection,
            ProjectSourceConnection.source_connection_id == SourceConnection.id,
        )
        .where(
            ProjectSourceConnection.project_id == project_id,
            SourceConnection.conn_name == conn_name,
        )
    )
    return result.scalars().first()


# ── Medallion Config ────────────────────────────────────────────────


async def get_medallion_config(
    db: AsyncSession, project_id: str
) -> MedallionConfig | None:
    result = await db.execute(
        select(MedallionConfig).where(MedallionConfig.project_id == project_id)
    )
    return result.scalars().first()


async def list_medallion_configs(
    db: AsyncSession, project_id: str
) -> list[MedallionConfig]:
    result = await db.execute(
        select(MedallionConfig).where(MedallionConfig.project_id == project_id)
    )
    return result.scalars().all()


async def save_medallion_config(
    db: AsyncSession, project_id: str, *, config_data: dict, result_data: dict
) -> MedallionConfig:
    existing = await get_medallion_config(db, project_id)
    if existing:
        for field, value in config_data.items():
            setattr(existing, field, value)
        existing.bronze_item_id = result_data.get("bronze_item_id")
        existing.silver_item_id = result_data.get("silver_item_id")
        existing.gold_item_id = result_data.get("gold_item_id")
        await db.commit()
        await db.refresh(existing)
        return existing
    mc = MedallionConfig(
        id=str(uuid4()),
        **config_data,
        bronze_item_id=result_data.get("bronze_item_id"),
        silver_item_id=result_data.get("silver_item_id"),
        gold_item_id=result_data.get("gold_item_id"),
        project_id=project_id,
    )
    db.add(mc)
    await db.commit()
    await db.refresh(mc)
    return mc


# ── Metadata Config ─────────────────────────────────────────────────


async def get_metadata_config(
    db: AsyncSession, project_id: str
) -> MetadataConfig | None:
    result = await db.execute(
        select(MetadataConfig).where(MetadataConfig.project_id == project_id)
    )
    return result.scalars().first()


async def save_metadata_config(
    db: AsyncSession,
    project_id: str,
    *,
    warehouse_id: str | None = None,
    metadata_created: bool = False,
    log_created: bool = False,
) -> MetadataConfig:
    existing = await get_metadata_config(db, project_id)
    if existing:
        if warehouse_id is not None:
            existing.warehouse_id = warehouse_id
        if metadata_created:
            existing.metadata_created = True
        if log_created:
            existing.log_created = True
        await db.commit()
        await db.refresh(existing)
        return existing
    mc = MetadataConfig(
        id=str(uuid4()),
        warehouse_id=warehouse_id,
        metadata_created=metadata_created,
        log_created=log_created,
        project_id=project_id,
    )
    db.add(mc)
    await db.commit()
    await db.refresh(mc)
    return mc


# ── Config Uploads (notebook/pipeline status) ───────────────────────


async def get_config_uploads(
    db: AsyncSession, project_id: str, source_connection_id: str | None = None
) -> list[ConfigUpload]:
    q = select(ConfigUpload).where(ConfigUpload.project_id == project_id)
    if source_connection_id:
        q = q.where(ConfigUpload.source_connection_id == source_connection_id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def save_config_upload(
    db: AsyncSession,
    *,
    project_id: str,
    source_connection_id: str | None,
    item_type: str,
    item_name: str,
    status: str = "success",
    fabric_item_id: str | None = None,
    run_status: str | None = None,
    job_id: str | None = None,
) -> ConfigUpload:
    # Upsert: update if same project + item_type + item_name exists.
    # item_name is the Fabric item's displayName, which is already unique
    # within a workspace/project for a given item_type — so we match on that
    # alone. (Previously this also required source_connection_id to match,
    # but source_connection_id is resolved via fuzzy name lookup and can
    # come back None on one run and a real id on another for the *same*
    # item, which silently created duplicate rows instead of updating the
    # existing one — and later broke update_config_upload_run_status with
    # MultipleResultsFound.)
    result = await db.execute(
        select(ConfigUpload)
        .where(
            ConfigUpload.project_id == project_id,
            ConfigUpload.item_type == item_type,
            ConfigUpload.item_name == item_name,
        )
        .order_by(ConfigUpload.updated_at.desc(), ConfigUpload.created_at.desc())
    )
    matches = list(result.scalars().all())
    existing = matches[0] if matches else None

    # No row saved under this exact item_name, but if we already know the
    # Fabric item id, check whether it's sitting under a *different*
    # item_name from an earlier attempt (e.g. an unprefixed name before the
    # connection prefix was resolved). Reuse that row instead of inserting a
    # second one for the same Fabric item — two rows for one pipeline is how
    # a successfully-run pipeline ends up still showing "Failed"/stuck
    # "Running" after a refresh, because status lookups only ever see one of
    # the two rows.
    if existing is None and fabric_item_id:
        by_item_result = await db.execute(
            select(ConfigUpload)
            .where(
                ConfigUpload.project_id == project_id,
                ConfigUpload.item_type == item_type,
                ConfigUpload.fabric_item_id == fabric_item_id,
            )
            .order_by(ConfigUpload.updated_at.desc(), ConfigUpload.created_at.desc())
        )
        by_item_matches = list(by_item_result.scalars().all())
        if by_item_matches:
            existing = by_item_matches[0]
            existing.item_name = item_name
            matches = [existing, *by_item_matches[1:]]

    for dup in matches[1:]:
        await db.delete(dup)
    if existing:
        existing.status = status
        existing.source_connection_id = source_connection_id
        if fabric_item_id is not None and fabric_item_id != existing.fabric_item_id:
            # Redeployed to a *different* Fabric item id. Any job_id/run_status
            # we had was recorded against the old item and is meaningless (and
            # permanently unresolvable — Fabric will 404 forever) against the
            # new one, so clear it unless the caller is explicitly setting a
            # fresh job_id/run_status in this same call.
            existing.fabric_item_id = fabric_item_id
            if job_id is None:
                existing.job_id = None
            if run_status is None:
                existing.run_status = None
        elif fabric_item_id is not None:
            existing.fabric_item_id = fabric_item_id
        if run_status is not None:
            existing.run_status = run_status
        if job_id is not None:
            existing.job_id = job_id
        await db.commit()
        await db.refresh(existing)
        return existing
    cu = ConfigUpload(
        id=str(uuid4()),
        project_id=project_id,
        source_connection_id=source_connection_id,
        item_type=item_type,
        item_name=item_name,
        status=status,
        fabric_item_id=fabric_item_id,
        run_status=run_status,
        job_id=job_id,
    )
    db.add(cu)
    await db.flush()
    await db.commit()
    return cu


async def update_config_upload_run_status(
    db: AsyncSession,
    *,
    project_id: str,
    item_type: str,
    item_name: str,
    run_status: str,
    job_id: str | None = None,
) -> ConfigUpload | None:
    """Update run_status and optionally job_id for an existing config upload.

    NOTE: (project_id, item_type, item_name) can end up matching more than one
    row — e.g. save_config_upload() upserts on
    (project_id, source_connection_id, item_type, item_name), and if
    source_connection_id resolves differently across runs (None vs. an actual
    id, due to fuzzy name matching), a second row gets created instead of the
    first being updated. Rather than crash with MultipleResultsFound, we
    update the most recently touched row and remove the older duplicate(s)
    so future lookups are unambiguous.
    """
    result = await db.execute(
        select(ConfigUpload)
        .where(
            ConfigUpload.project_id == project_id,
            ConfigUpload.item_type == item_type,
            ConfigUpload.item_name == item_name,
        )
        .order_by(ConfigUpload.updated_at.desc(), ConfigUpload.created_at.desc())
    )
    matches = list(result.scalars().all())
    if not matches:
        return None

    existing, *stale = matches
    existing.run_status = run_status
    if job_id is not None:
        existing.job_id = job_id

    for dup in stale:
        await db.delete(dup)

    await db.commit()
    await db.refresh(existing)
    return existing


# ── ITL Watermark Config ─────────────────────────────────────────────


async def save_itl_watermark_config(
    db: AsyncSession,
    *,
    project_id: str,
    connection_name: str,
    config_rows: list[dict],
) -> ItlWatermarkConfig:
    """Upsert ITL watermark config for a project + connection."""
    import json

    result = await db.execute(
        select(ItlWatermarkConfig).where(
            ItlWatermarkConfig.project_id == project_id,
            ItlWatermarkConfig.connection_name == connection_name,
        )
    )
    existing = result.scalar_one_or_none()
    config_json = json.dumps(config_rows)

    if existing:
        existing.config_json = config_json
        await db.commit()
        await db.refresh(existing)
        return existing

    record = ItlWatermarkConfig(
        id=str(uuid4()),
        project_id=project_id,
        connection_name=connection_name,
        config_json=config_json,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def get_itl_watermark_config(
    db: AsyncSession, project_id: str, connection_name: str
) -> ItlWatermarkConfig | None:
    """Get stored ITL watermark config."""
    result = await db.execute(
        select(ItlWatermarkConfig).where(
            ItlWatermarkConfig.project_id == project_id,
            ItlWatermarkConfig.connection_name == connection_name,
        )
    )
    return result.scalar_one_or_none()


# ── Semantic Model Upload (Excel: tables / relationships / measures) ──


async def save_semantic_model_upload(
    db: AsyncSession,
    *,
    project_id: str,
    filename: str,
    tables: list[dict],
    relationships: list[dict],
    measures: list[dict],
) -> SemanticModelUpload:
    """Upsert the parsed semantic-model Excel for a project — one row per
    project, replaced wholesale on every re-upload."""
    import json

    result = await db.execute(
        select(SemanticModelUpload).where(SemanticModelUpload.project_id == project_id)
    )
    existing = result.scalars().first()
    tables_json = json.dumps(tables)
    relationships_json = json.dumps(relationships)
    measures_json = json.dumps(measures)

    if existing:
        existing.filename = filename
        existing.tables_json = tables_json
        existing.relationships_json = relationships_json
        existing.measures_json = measures_json
        await db.commit()
        await db.refresh(existing)
        return existing

    record = SemanticModelUpload(
        id=str(uuid4()),
        project_id=project_id,
        filename=filename,
        tables_json=tables_json,
        relationships_json=relationships_json,
        measures_json=measures_json,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def get_semantic_model_upload(
    db: AsyncSession, project_id: str
) -> SemanticModelUpload | None:
    result = await db.execute(
        select(SemanticModelUpload).where(SemanticModelUpload.project_id == project_id)
    )
    return result.scalars().first()


# ── Fabric Credentials ───────────────────────────────────────────────


async def save_fabric_credential(
    db: AsyncSession,
    *,
    project_id: str,
    client_id: str,
    client_secret: str,
    tenant_id: str,
    capacity_id: str,
    user_object_id: str | None = None,
    workspace_id: str | None = None,
) -> FabricCredential:
    """Save or update Fabric credentials for a project."""
    result = await db.execute(
        select(FabricCredential).where(FabricCredential.project_id == project_id)
    )
    cred = result.scalars().first()
    if cred:
        cred.client_id = client_id
        cred.client_secret = client_secret
        cred.tenant_id = tenant_id
        cred.capacity_id = capacity_id
        if user_object_id is not None:
            cred.user_object_id = user_object_id
        if workspace_id is not None:
            cred.workspace_id = workspace_id
    else:
        cred = FabricCredential(
            client_id=client_id,
            client_secret=client_secret,
            tenant_id=tenant_id,
            capacity_id=capacity_id,
            user_object_id=user_object_id,
            workspace_id=workspace_id,
            project_id=project_id,
        )
        db.add(cred)
    await db.commit()
    await db.refresh(cred)
    return cred


async def get_fabric_credential(
    db: AsyncSession, project_id: str
) -> FabricCredential | None:
    """Get stored Fabric credentials for a project."""
    result = await db.execute(
        select(FabricCredential).where(FabricCredential.project_id == project_id)
    )
    return result.scalars().first()


async def update_credential_workspace_id(
    db: AsyncSession, project_id: str, workspace_id: str
) -> None:
    """Update the workspace_id on stored credentials after provisioning."""
    result = await db.execute(
        select(FabricCredential).where(FabricCredential.project_id == project_id)
    )
    cred = result.scalars().first()
    if cred:
        cred.workspace_id = workspace_id
        await db.commit()