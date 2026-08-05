"""FastAPI routes for the mapping module."""

import asyncio
import uuid
import io
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
import pandas as pd

from app.db.session import get_async_session, async_session_maker

from app.modules.finin.mapping.schema import DBCredentials, ProjectMappingRequest
from app.modules.finin.mapping.service import (
    build_conn_string,
    compute_unmapped_source_columns,
    build_column_config_rows,
    normalize_primary_key_flag,
)
from app.modules.finin.mapping.graph.builder import MAPPING_GRAPH
from app.modules.finin.mapping.graph.state import MappingState
from app.modules.finin.mapping.repository import get_template_rows
from app.modules.finin.shared.job_store import create_job, get_job, update_job
from app.modules.finin.shared.utils import safe_mean, safe_round, sanitize_for_json
from app.shared.excel_style import style_worksheet, CLR_HEADER_DEFAULT, CLR_HEADER_ALT
from app.modules.finin.core.config import settings

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.users.models.user import User
from app.modules.auth.service import fastapi_users

router = APIRouter(tags=["mapping"])
current_active_user = fastapi_users.current_user(active=True)

# asyncio.create_task() doesn't keep its task alive on its own — without a
# strong reference held somewhere, the task is eligible for garbage
# collection mid-run, which can silently abandon a save-to-metadata job.
# This set exists purely to hold that reference until each task finishes.
_BACKGROUND_SAVE_TASKS: set[asyncio.Task] = set()


def run_mapping(job_id: str, creds: DBCredentials):
    """Background task: execute the mapping graph."""
    try:
        update_job(job_id, status="running", message="Starting semantic mapping…")
        initial_state: MappingState = {
            "creds": creds,
            "job_id": job_id,
            "template_by_table": {},
            "source_by_table": {},
            "source_records": [],
            "table_map": {},
            "mapped_rows": [],
            "final_result": None,
            "error": None,
        }
        MAPPING_GRAPH.invoke(initial_state)
    except Exception as e:
        update_job(job_id, status="error", message=str(e))
        print(f"Job {job_id} failed: {e}")


@router.post("/api/test-connection")
def test_connection(creds: DBCredentials):
    """Test database connectivity for the source lakehouse. (Template is read
    from the local app.db copy, not a live connection — nothing to test there.)"""
    import pyodbc
    try:
        with pyodbc.connect(build_conn_string(creds, creds.source_db), timeout=10):
            pass
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Source database '{creds.source_db}' — {e}")
    return {"ok": True, "message": "Source database connected successfully."}


@router.post("/api/test-azure-openai")
def test_azure_openai():
    """Test Azure OpenAI connectivity."""
    try:
        from app.modules.finin.core.llm import make_llm
        from langchain_core.messages import HumanMessage
        llm = make_llm()
        resp = llm.invoke([HumanMessage(content="Say: Azure OpenAI is ready")])
        return {"ok": True, "message": resp.content, "deployment": settings.AZURE_OPENAI_DEPLOYMENT}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/run-mapping")
async def start_mapping(
    creds: DBCredentials,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_session),
):
    """Queue a new mapping job."""
    if not creds.template_rows:
        creds.template_rows = await get_template_rows(db)
    job_id = str(uuid.uuid4())
    create_job(job_id)
    background_tasks.add_task(run_mapping, job_id, creds)
    return {"job_id": job_id}


async def _build_creds_from_project(body: ProjectMappingRequest, user: User, db: AsyncSession) -> DBCredentials:
    from app.modules.fabric.service import resolve_project_fabric_connection

    conn = await resolve_project_fabric_connection(body.project_id, user, db)

    source_db = body.source_db
    source_table = body.source_table

    if body.connection_name and not source_table:
        # Read column metadata straight from what the OTL setup already
        # populated, instead of connecting to the live source system —
        # this is what makes "no server/tenant for the source side" possible.
        from app.modules.fabric import repository as fabric_repo

        sc = await fabric_repo.find_project_connection_by_name(db, body.project_id, body.connection_name)
        if not sc:
            raise HTTPException(status_code=404, detail=f"Connection '{body.connection_name}' not found")

        db_type = (sc.db_type or "").lower()
        schema_name = f"Config_{body.connection_name}"
        if "oracle" in db_type:
            select_cols = "OWNER AS TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE"
        elif "postgres" in db_type or db_type == "pg":
            select_cols = "table_schema AS TABLE_SCHEMA, table_name AS TABLE_NAME, column_name AS COLUMN_NAME, data_type AS DATA_TYPE"
        else:
            select_cols = "TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE"

        source_db = source_db or conn["warehouse_name"]
        source_table = (
            f"(SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, TABLE_SCHEMA "
            f"FROM (SELECT {select_cols} FROM [{schema_name}].[SourceInformationSchema]) inner_src) AS src"
        )

    return DBCredentials(
        server=conn["server"],
        template_server=conn.get("template_server") or "",
        template_rows=await get_template_rows(db),
        client_id=conn["client_id"],
        client_secret=conn["client_secret"],
        tenant_id=conn["tenant_id"],
        template_lakehouse=body.template_lakehouse,
        template_db=body.template_db,
        source_lakehouse=body.source_lakehouse,
        source_db=source_db or "WH_MetaData",
        template_table=body.template_table,
        source_table=source_table or "dbo.source_position",
        min_confidence=body.min_confidence,
        batch_size=body.batch_size,
        temperature=body.temperature,
    )


@router.get("/api/saved-mapping/{project_id}/{connection_name}")
async def saved_mapping(
    project_id: str,
    connection_name: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """If this connection already has a saved AI Mapping (ai_mapping_saved),
    read it back from Config_<connection_name>.SourceInformationSchemaMapped
    and return it in the same {job_id, result} shape as a live job, so the
    AI Mapping page can show the existing summary directly instead of
    forcing the user through the whole mapping process again."""
    from app.modules.fabric.service import get_saved_finin_mapping_handler

    saved = await get_saved_finin_mapping_handler(project_id, connection_name, user, db)
    if not saved:
        raise HTTPException(status_code=404, detail="No saved mapping found for this connection")
    return saved


@router.get("/api/project-connection-info/{project_id}")
async def project_connection_info(
    project_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Non-secret info so the UI can show *which* Fabric identity will be used,
    without ever sending the client secret to the browser."""
    from app.modules.fabric.service import resolve_project_fabric_connection

    conn = await resolve_project_fabric_connection(project_id, user, db)
    return {"client_id": conn["client_id"], "tenant_id": conn["tenant_id"], "has_credentials": bool(conn["client_id"])}


@router.post("/api/test-connection-for-project")
async def test_connection_for_project(
    body: ProjectMappingRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Same as /api/test-connection, but using the logged-in user's saved
    Fabric project credentials instead of manually-entered ones."""
    creds = await _build_creds_from_project(body, user, db)
    if not creds.template_rows:
        raise HTTPException(status_code=400, detail="Template schema not found in app.db — check template_seed.json.")
    import pyodbc
    try:
        with pyodbc.connect(build_conn_string(creds, creds.source_db), timeout=10):
            pass
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Source metadata database '{creds.source_db}' on {creds.server} — {e}. "
                   f"This should be the same warehouse used for Save to Metadata, so if that "
                   f"works but this doesn't, check the connection's Config_<name> schema exists.",
        )
    return {"ok": True, "message": "Template schema loaded locally; source database connected successfully."}


@router.post("/api/run-mapping-for-project")
async def start_mapping_for_project(
    body: ProjectMappingRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Same as /api/run-mapping, but using the logged-in user's saved Fabric
    project credentials instead of manually-entered ones."""
    creds = await _build_creds_from_project(body, user, db)
    job_id = str(uuid.uuid4())
    create_job(job_id)
    background_tasks.add_task(run_mapping, job_id, creds)
    return {"job_id": job_id}


@router.get("/api/job/{job_id}")
def get_job_status(job_id: str):
    """Get job status and results."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return sanitize_for_json(job)


@router.post("/api/apply-overrides/{job_id}")
async def apply_overrides(
    job_id: str,
    body: dict,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Apply manual column mapping overrides.

    This always updates the live in-memory job (so the AI Mapping summary
    reflects the change immediately) — but that alone doesn't survive a
    page reload, since reload re-fetches the *persisted* mapping
    (ai_mapping_result_json) rather than this in-memory job. If the
    project_id/connection_name for this job's connection are known and
    that connection already has a saved mapping, also refresh the
    persisted JSON cache here so overrides stick across reloads without
    requiring a separate "Save to Metadata" click (which does a much
    heavier full warehouse write and shouldn't be implied by every
    single manual-mapping edit).
    """
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="Job not ready")

    overrides: dict = body.get("overrides", {})
    rows: list = job["result"]["rows"]
    source_column_datatypes = job["result"].get("source_column_datatypes", {})
    applied = 0

    for row in rows:
        key = f"{row['template_table']}.{row['template_column']}"
        if key in overrides:
            ov = overrides[key]
            if ov.get("source_table") and ov.get("source_column"):
                manual_datatype = (ov.get("datatype") or "").strip()
                if manual_datatype:
                    datatype = manual_datatype
                else:
                    # No manual datatype typed — fall back to the real
                    # column datatype from the source schema, if known.
                    datatype = source_column_datatypes.get(ov["source_table"], {}).get(ov["source_column"], "")
                row.update(
                    mapped_source_table=ov["source_table"],
                    mapped_source_column=ov["source_column"],
                    mapped_source_datatype=datatype,
                    status="matched",
                    reason="manual override",
                    mapping_score=1.0,
                )
                applied += 1

    df = pd.DataFrame(rows)
    m = df[df["status"] == "matched"]
    n = len(rows)

    job["result"]["stats"].update(
        matched=len(m),
        unmatched=n - len(m),
        match_rate=round(len(m) / n * 100, 1) if n else 0,
        avg_score=safe_round(safe_mean(m["mapping_score"]), 3),
        template_tables=int(df["template_table"].nunique()),
        score_distribution={
            "high": int((m["mapping_score"] >= 0.85).sum()),
            "medium": int(((m["mapping_score"] >= 0.72) & (m["mapping_score"] < 0.85)).sum()),
        },
    )
    job["result"]["rows"] = rows

    # Recompute leftover/unmapped source columns now that overrides may have
    # claimed some previously-unused ones. Uses the same helper (and the
    # same <TemplateTable>External / <SourceTable>External naming rule) as
    # the initial run.
    unmapped_source_columns = compute_unmapped_source_columns(
        rows,
        job["result"].get("source_column_datatypes", {}),
        job["result"]["stats"].get("table_alignment", {}),
    )
    job["result"]["unmapped_source_columns"] = unmapped_source_columns

    # Persist the updated result back into the (SQLite-backed) job store.
    # get_job() above returned a plain deserialized copy, not a live
    # reference — mutating it in memory has no effect on disk until this
    # is called. Without it, this endpoint's response looked correct, but
    # the very next GET /api/job/{job_id} (e.g. on a page refresh, before
    # "Save to Metadata" was clicked) re-read the *old* row from SQLite
    # and silently reverted every override.
    update_job(job_id, result=job["result"])

    # Refresh the persisted mapping cache, if this job is tied to a
    # connection that already has one saved — see docstring above.
    project_id = body.get("project_id")
    connection_name = body.get("connection_name")
    if project_id and connection_name:
        from app.modules.fabric import repository as fabric_repo

        sc = await fabric_repo.find_project_connection_by_name(db, project_id, connection_name)
        if sc and sc.ai_mapping_saved:
            import json

            sc.ai_mapping_result_json = json.dumps(job["result"])
            db.add(sc)
            await db.commit()

    return sanitize_for_json({
        "ok": True,
        "applied": applied,
        "rows": rows,
        "stats": job["result"]["stats"],
        "unmapped_source_columns": unmapped_source_columns,
    })


@router.get("/api/download/{job_id}")
def download_csv(job_id: str, filter: str = "all"):
    """Download mapping results as CSV."""
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="Job not ready")

    rows = job["result"]["rows"]
    df = pd.DataFrame(rows)

    if filter == "matched":
        df = df[df["status"] == "matched"]
    elif filter == "unmatched":
        df = df[df["status"] == "unmatched"]

    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=mapping_{filter}_{job_id[:8]}.csv"},
    )


@router.get("/api/download-xlsx/{job_id}")
def download_xlsx(job_id: str, filter: str = "all"):
    """Download mapping results as Excel, plus one sheet per '<table>External'
    listing source columns that never matched any template column."""
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="Job not ready")

    rows = job["result"]["rows"]
    df = pd.DataFrame(rows)

    if filter == "matched":
        df = df[df["status"] == "matched"]
    elif filter == "unmatched":
        df = df[df["status"] == "unmatched"]

    unmapped_source_columns = job["result"].get("unmapped_source_columns", {})

    export_df = df.copy()
    if "is_primary_key" in export_df.columns:
        export_df["IsPrimaryKey"] = export_df["is_primary_key"].apply(normalize_primary_key_flag)
    elif "IsPrimaryKey" not in export_df.columns:
        export_df["IsPrimaryKey"] = 0

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        export_df.to_excel(writer, index=False, sheet_name="Mapping")
        mapping_ws = writer.sheets["Mapping"]
        # Highlight the confidence/score-derived columns the same way the
        # ITL config sheet highlights its "suggested" watermark columns.
        suggested_cols = {
            i + 1 for i, col in enumerate(export_df.columns)
            if col.lower() in ("confidence", "score", "match_score")
        }
        style_worksheet(
            mapping_ws,
            num_data_rows=len(export_df),
            num_cols=len(export_df.columns),
            header_color=CLR_HEADER_DEFAULT,
            highlight_col_indices=suggested_cols,
        )

        for ext_name, payload in unmapped_source_columns.items():
            ext_df = pd.DataFrame(payload["columns"])  # source_table, source_column, datatype
            # Excel sheet names are capped at 31 characters.
            sheet_name = ext_name[:31]
            ext_df.to_excel(writer, index=False, sheet_name=sheet_name)
            style_worksheet(
                writer.sheets[sheet_name],
                num_data_rows=len(ext_df),
                num_cols=len(ext_df.columns),
                header_color=CLR_HEADER_ALT,
            )
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=mapping_{filter}_{job_id[:8]}.xlsx"},
    )


@router.get("/api/download-column-config/{job_id}")
def download_column_config(job_id: str):
    """Download the consolidated ColumnConfig sheet:

    Source Table | Source Column | Target Table (Template table name) |
    Target Column | Target Data type | Is Extension

    Every matched row plus every leftover/unmapped source column is
    included — the latter with Target Table set to its
    "<TemplateTable>External" (if its source table aligned to a template
    table) or its own "<SourceTable>External" bucket, and
    Is Extension = True.
    """
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="Job not ready")

    rows = job["result"]["rows"]
    unmapped_source_columns = job["result"].get("unmapped_source_columns", {})

    config_rows = build_column_config_rows(rows, unmapped_source_columns)
    df = pd.DataFrame(config_rows, columns=[
        "Source Table", "Source Column", "Target Table", "Target Column", "Target Data type", "Is Extension", "IsPrimaryKey",
    ])

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="ColumnConfig")
        ws = writer.sheets["ColumnConfig"]
        highlight_cols = {df.columns.get_loc(c) + 1 for c in ("Is Extension",) if c in df.columns}
        style_worksheet(
            ws,
            num_data_rows=len(df),
            num_cols=len(df.columns),
            header_color=CLR_HEADER_DEFAULT,
            highlight_col_indices=highlight_cols,
            col_widths=[22, 24, 22, 22, 18, 14, 14],
        )
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=ColumnConfig_{job_id[:8]}.xlsx"},
    )


@router.post("/api/save-to-metadata/{job_id}")
async def save_to_metadata(
    job_id: str,
    body: dict,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Kick off persisting this job's mapping results into
    [Config_<connection_name>].[SourceInformationSchemaMapped] in the
    project's Fabric metadata warehouse, as a background job. Poll
    /api/save-to-metadata-status/{save_job_id} for live percentage progress.
    """
    project_id = body.get("project_id")
    connection_name = body.get("connection_name")
    if not project_id or not connection_name:
        raise HTTPException(status_code=400, detail="project_id and connection_name are required")

    job = get_job(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="Job not ready")

    rows = job["result"]["rows"]
    unmapped_source_columns = job["result"].get("unmapped_source_columns", {})
    config_rows = build_column_config_rows(rows, unmapped_source_columns)

    save_rows = [
        {
            "source_table_schema": "",
            "source_table": r["Source Table"],
            "source_column": r["Source Column"],
            "source_datatype": "",
            "target_table": r["Target Table"],
            "target_column": r["Target Column"],
            "target_datatype": r["Target Data type"],
            "is_extension": bool(r["Is Extension"]),
            "is_primary_key": bool(r["IsPrimaryKey"]),
            "status": "matched" if not r["Is Extension"] else "unmatched",
            "score": 0.0,
            "reason": "",
        }
        for r in config_rows
    ]

    save_job_id = f"save_{job_id}_{uuid.uuid4().hex[:8]}"
    create_job(save_job_id)
    update_job(save_job_id, status="running", total=len(save_rows), progress=0, message="Starting save…")

    # Own DB session for the background task — the request-scoped `db`
    # session gets torn down once this endpoint returns, so reusing it here
    # would risk operating on a closed session once the background task
    # actually runs.
    async def _run_save():
        async with async_session_maker() as bg_db:
            try:
                from app.modules.fabric.service import save_finin_mapping_handler

                inserted = await save_finin_mapping_handler(
                    project_id, connection_name, job_id, save_rows, user, bg_db,
                    progress_job_id=save_job_id, full_result=job["result"],
                )
                update_job(save_job_id, status="done", progress=100, message="Save complete",
                            result={"inserted": inserted, "table": "SourceInformationSchemaMapped"})
            except Exception as e:
                update_job(save_job_id, status="failed", message=str(e))

    task = asyncio.create_task(_run_save())
    _BACKGROUND_SAVE_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_SAVE_TASKS.discard)
    return {"status": "started", "save_job_id": save_job_id, "total": len(save_rows)}


@router.get("/api/save-to-metadata-status/{save_job_id}")
async def save_to_metadata_status(save_job_id: str):
    """Poll for live progress of a background save-to-metadata job."""
    job = get_job(save_job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Save job not found")
    return {
        "status": job.get("status", "running"),
        "progress": job.get("progress", 0),
        "total": job.get("total", 0),
        "message": job.get("message", ""),
        "result": job.get("result"),
    }


@router.get("/api/template-rows")
async def template_rows(db: AsyncSession = Depends(get_async_session)):
    """The local financial template schema (see mapping/repository.py) — no
    Fabric connection needed. Used by manual/no-project mode so the frontend
    never has to ask for a Template database/table name."""
    return {"rows": await get_template_rows(db)}


@router.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "model": settings.AZURE_OPENAI_DEPLOYMENT, "mode": "langgraph_two_stage"}