import logging
import os
import json
import base64
import time
import threading
 
import httpx
 
from app.modules.fabric.services.auth import FABRIC_API_BASE
from app.modules.fabric.services.medallion import create_folder
 
logger = logging.getLogger(__name__)
 
_TIMEOUT = httpx.Timeout(120.0, connect=10.0)
_LRO_POLL_INTERVAL = 3
_LRO_MAX_POLLS = 20
 
_PIPELINES_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "pipelines")
)
 
# Module-level cache — populated once at first request
_pipelines_cache: list[dict] | None = None
_pipelines_cache_lock = threading.Lock()
 
 
def _build_pipelines_cache() -> list[dict]:
    folder = os.path.join(_PIPELINES_DIR, "OTL")
    if not os.path.isdir(folder):
        return []
    seen: set[str] = set()
    result: list[dict] = []
    for root, _dirs, files in os.walk(folder):
        for fname in sorted(files):
            if fname.endswith(".json") and fname not in seen:
                seen.add(fname)
                path = os.path.join(root, fname)
                result.append({"filename": fname, "name": os.path.splitext(fname)[0], "size_bytes": os.path.getsize(path)})
    return result
 
 
def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
 
 
def _find_pipeline_by_name(
    token: str, workspace_id: str, pipeline_name: str
) -> dict | None:
    """Look up a data pipeline by display name."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/dataPipelines"
    try:
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=_TIMEOUT,
        )
        if resp.status_code == 200:
            for item in resp.json().get("value", []):
                if (item.get("displayName") or "").lower() == pipeline_name.lower():
                    return item
    except Exception:
        pass
    return None
 
 
def _poll_lro(token: str, location_url: str) -> dict | None:
    """Poll a Fabric long-running operation until it completes."""
    if not location_url:
        return None
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(_LRO_MAX_POLLS):
        time.sleep(_LRO_POLL_INTERVAL)
        try:
            resp = httpx.get(location_url, headers=headers, timeout=_TIMEOUT)
            if resp.status_code != 200:
                continue
            data = resp.json()
            status = (data.get("status") or "").lower()
            if status in ("succeeded", "completed"):
                return data
            if status == "failed":
                return data
        except Exception:
            continue
    return None
 
 
def _wait_for_pipeline(token: str, workspace_id: str, name: str, max_wait: int = 60) -> bool:
    """Poll until a pipeline exists in the workspace (handles async 202 creation)."""
    for _ in range(max_wait // 5):
        if _find_pipeline_by_name(token, workspace_id, name):
            return True
        time.sleep(5)
    return False
 
 
def list_workspace_pipelines(token: str, workspace_id: str) -> list[dict]:
    """List all DataPipeline items in the Fabric workspace."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/dataPipelines"
    resp = httpx.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=_TIMEOUT,
    )
    if resp.status_code != 200:
        logger.warning("Failed to list workspace pipelines: %s", resp.status_code)
        return []
    items = resp.json().get("value", [])
    return [
        {"id": item["id"], "name": item.get("displayName", item["id"])}
        for item in items
    ]
 
 
def run_fabric_pipeline(
    token: str,
    workspace_id: str,
    pipeline_item_id: str,
    parameters: dict | None = None,
    job_type: str = "Pipeline",
) -> str | None:
    """Trigger a Fabric pipeline run and return the job instance ID."""
    url = (
        f"{FABRIC_API_BASE}/workspaces/{workspace_id}"
        f"/items/{pipeline_item_id}/jobs/instances?jobType={job_type}"
    )
    payload = {"executionData": {"parameters": parameters or {}}}
 
    resp = httpx.post(
        url,
        headers=_headers(token),
        json=payload,
        timeout=_TIMEOUT,
    )
    if resp.status_code == 202 and "Location" in resp.headers:
        status_url = resp.headers["Location"]
        job_id = status_url.rstrip("/").split("/")[-1]
        logger.info("Pipeline run started: job_id=%s", job_id)
        return job_id
 
    logger.error(
        "Failed to start pipeline run (%s): %s", resp.status_code, resp.text
    )
    raise RuntimeError(
        f"Failed to start pipeline run ({resp.status_code}): {resp.text}"
    )
 
 
def get_pipeline_job_status(
    token: str,
    workspace_id: str,
    pipeline_item_id: str,
    job_id: str,
    _status_retries: int = 3,
) -> dict:
    """Check the status of a pipeline job instance.

    Fabric's job-instance endpoint can return a transient 404 ItemNotFound
    shortly after a job starts/finishes (eventual consistency), or when this
    is re-queried after a page refresh. A single 404 is NOT proof the
    pipeline failed, so we retry briefly before giving up. If it still can't
    be found, we report "unknown" (not "failed") so callers don't
    permanently mark a possibly-successful run as failed.
    """
    url = (
        f"{FABRIC_API_BASE}/workspaces/{workspace_id}"
        f"/items/{pipeline_item_id}/jobs/instances/{job_id}"
    )
    resp = None
    for attempt in range(_status_retries):
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=_TIMEOUT,
        )
        if resp.status_code in (200, 202):
            break
        if resp.status_code == 404 and attempt < _status_retries - 1:
            logger.warning(
                "Job status check got 404 for job %s (attempt %d/%d) — "
                "retrying, this is likely transient.",
                job_id, attempt + 1, _status_retries,
            )
            time.sleep(_LRO_POLL_INTERVAL)
            continue
        break

    if resp.status_code not in (200, 202):
        logger.warning(
            "Job status check failed (%s): %s", resp.status_code, resp.text
        )
        if resp.status_code == 404:
            # Not found after retries: unknown, NOT a confirmed failure.
            # Let the caller keep polling / avoid persisting a false "failed".
            return {"status": "unknown", "job_id": job_id}
        return {"status": "failed", "job_id": job_id}
 
    data = resp.json()
    status = (data.get("status") or "").lower()
    logger.info("Pipeline job %s status: %s", job_id, status)
    if status == "completed":
        return {"status": "completed", "job_id": job_id}
    if status in ("failed", "error", "cancelled"):
        fail_error = data.get("failureReason") or data.get("error", {})
        logger.error(
            "Pipeline job %s reached terminal state '%s': %s",
            job_id, status, fail_error,
        )
        return {"status": status, "job_id": job_id, "error": str(fail_error) if fail_error else None}
    return {"status": "in_progress", "job_id": job_id}
 
 
def get_latest_item_job_status(
    token: str,
    workspace_id: str,
    pipeline_item_id: str,
) -> dict:
    """Look up the most recent job instance for a pipeline item, regardless of
    who triggered it.

    Some pipelines (e.g. child pipelines invoked internally by an "Invoke
    Pipeline" activity inside a parent/master pipeline) never get run
    directly by our own run_fabric_pipeline() call, so we never capture a
    job_id for them via get_pipeline_job_status(). Fabric still records a
    job instance for them though (triggered by the parent), so we list the
    item's recent job instances and report the status of the latest one.
    This lets the UI reflect an inner/child pipeline as "completed" as soon
    as Fabric says so, instead of only ever showing it as pending/running
    until the outer parent pipeline itself finishes.
    """
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/items/{pipeline_item_id}/jobs/instances"
    resp = httpx.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=_TIMEOUT,
    )
    if resp.status_code != 200:
        logger.warning(
            "Latest job instance lookup failed for item %s (%s): %s",
            pipeline_item_id, resp.status_code, resp.text,
        )
        return {"status": "unknown"}

    instances = resp.json().get("value") or []
    if not instances:
        # No job instance recorded yet — the parent hasn't reached this
        # child activity yet, so treat it as still pending, not failed.
        return {"status": "not-started"}

    # The API doesn't document a guaranteed ordering (and doesn't support a
    # `top`/sort query param), so sort by start time ourselves rather than
    # trusting element [0] to be the latest — getting this wrong silently
    # locks the UI onto a stale instance's status forever.
    def _start_key(inst: dict) -> str:
        return inst.get("startTimeUtc") or inst.get("submittedTimeUtc") or ""

    latest = max(instances, key=_start_key)
    job_id = latest.get("id")
    status = (latest.get("status") or "").lower()
    if status == "completed":
        return {"status": "completed", "job_id": job_id}
    if status in ("failed", "error", "cancelled"):
        fail_error = latest.get("failureReason") or latest.get("error", {})
        return {"status": status, "job_id": job_id, "error": str(fail_error) if fail_error else None}
    if status in ("notstarted", "not_started", ""):
        return {"status": "not-started", "job_id": job_id}
    return {"status": "in_progress", "job_id": job_id}


def list_local_pipelines(directory: str | None = None) -> list[dict]:
    """Return metadata for every .json pipeline file. Uses module-level cache for speed."""
    global _pipelines_cache
    if directory:
        if not os.path.isdir(directory):
            return []
        seen: set[str] = set()
        result: list[dict] = []
        for root, _dirs, files in os.walk(directory):
            for fname in sorted(files):
                if fname.endswith(".json") and fname not in seen:
                    seen.add(fname)
                    path = os.path.join(root, fname)
                    result.append({"filename": fname, "name": os.path.splitext(fname)[0], "size_bytes": os.path.getsize(path)})
        return result
    with _pipelines_cache_lock:
        if _pipelines_cache is None:
            _pipelines_cache = _build_pipelines_cache()
        return list(_pipelines_cache)
 
 
def _get_lakehouse_connection_id(
    token: str, workspace_id: str, lakehouse_id: str, retries: int = 5
) -> str | None:
    """Fetch the SQL endpoint connection GUID for a lakehouse.
 
    The Fabric API returns sqlEndpointProperties with both 'id' (a GUID)
    and 'connectionString' (a hostname).  Pipeline externalReferences.connection
    requires the GUID, not the hostname.
 
    The SQL endpoint may still be provisioning after lakehouse creation,
    so retry a few times with a delay.
    """
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/lakehouses/{lakehouse_id}"
    for attempt in range(retries):
        resp = httpx.get(
            url, headers={"Authorization": f"Bearer {token}"}, timeout=_TIMEOUT
        )
        if resp.status_code != 200:
            logger.warning(
                "Lakehouse lookup attempt %d/%d failed: %s",
                attempt + 1, retries, resp.status_code,
            )
            if attempt < retries - 1:
                time.sleep(_LRO_POLL_INTERVAL)
            continue
        data = resp.json()
        props = data.get("properties", {}).get("sqlEndpointProperties", {})
        endpoint_id = props.get("id")
        prov_status = props.get("provisioningStatus", "").lower()
        if endpoint_id:
            return endpoint_id
        if prov_status in ("", "inprogress", "provisioning"):
            logger.info(
                "Lakehouse SQL endpoint still provisioning (attempt %d/%d, status=%s)",
                attempt + 1, retries, prov_status,
            )
            if attempt < retries - 1:
                time.sleep(_LRO_POLL_INTERVAL * 2)
            continue
        # Status is something else (e.g. failed) — stop retrying
        logger.warning("Lakehouse SQL endpoint status: %s", prov_status)
        break
    return None
 
 
def _get_warehouse_sql_endpoint(
    token: str, workspace_id: str, warehouse_id: str
) -> str | None:
    """Return the SQL endpoint (connection string) for a warehouse."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/warehouses/{warehouse_id}"
    resp = httpx.get(
        url, headers={"Authorization": f"Bearer {token}"}, timeout=_TIMEOUT
    )
    if resp.status_code != 200:
        return None
    props = resp.json().get("properties", {})
    return props.get("connectionString") or props.get("connectionInfo")
 
 
def _get_item_id_by_name(
    token: str, workspace_id: str, item_type: str, name: str
) -> str | None:
    """Find an item by display name. item_type = 'warehouses' or 'lakehouses'."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/{item_type}"
    resp = httpx.get(
        url, headers={"Authorization": f"Bearer {token}"}, timeout=_TIMEOUT
    )
    if resp.status_code == 200:
        for item in resp.json().get("value", []):
            if item.get("displayName") == name:
                return item["id"]
    return None
 
 
# -- Source type mapping -------------------------------------------------
_SOURCE_TYPE_MAP = {
    "sql server": "SqlServerSource",
    "azure sql": "SqlServerSource",
    "mysql": "MySqlSource",
    "oracle": "OracleSource",
    "postgres": "PostgreSqlSource",
    "postgresql": "PostgreSqlSource",
}
 
_DATASET_TYPE_MAP = {
    "sql server": "SqlServerTable",
    "azure sql": "AzureSqlTable",
    "mysql": "MySqlTable",
    "oracle": "OracleTable",
    "postgres": "PostgreSqlTable",
    "postgresql": "PostgreSqlTable",
}
 
# -- Datetime format mapping for different database types in ITL pipelines --
# Oracle uses TO_TIMESTAMP with format 'YYYY-MM-DD HH24:MI:SS.FF'
# SQL Server uses CAST with format 'yyyy-MM-dd hh24:mi:ss.ffffff'
# PostgreSQL uses timestamp with format 'YYYY-MM-DD HH24:MI:SS'
_DATETIME_FORMAT_MAP = {
    "sql server": "yyyy-MM-dd HH:mm:ss.ffffff",
    "azure sql": "yyyy-MM-dd HH:mm:ss.ffffff",
    "mysql": "%Y-%m-%d %H:%i:%S",
    "oracle": "YYYY-MM-DD HH24:MI:SS.FF",
    "postgres": "YYYY-MM-DD HH24:MI:SS",
    "postgresql": "YYYY-MM-DD HH24:MI:SS",
}
 
# -- Timestamp SQL generation for different DB types --
_TIMESTAMP_SQL_MAP = {
    "sql server": "CAST('@timestamp' AS datetimeoffset)",
    "azure sql": "CAST('@timestamp' AS datetimeoffset)",
    "mysql": "STR_TO_DATE('@timestamp', '%Y-%m-%d %H:%i:%S')",
    "oracle": "TO_TIMESTAMP('@timestamp', 'YYYY-MM-DD HH24:MI:SS.FF')",
    "postgres": "'@timestamp'::timestamp",
    "postgresql": "'@timestamp'::timestamp",
}
 
# -- ADF timestamp function for ITL pipeline queries (database-specific SQL) --
# These are used directly in ADF pipeline expressions for WHERE clauses
_TIMESTAMP_FUNC_MAP = {
    "sql server": "CAST('@timestamp' AS datetime)",
    "azure sql": "CAST('@timestamp' AS datetime)",
    "mysql": "CAST('@timestamp' AS datetime)",
    "oracle": "TO_TIMESTAMP('@timestamp', 'YYYY-MM-DD HH24:MI:SS.FF')",
    "postgres": "'@timestamp'::timestamp",
    "postgresql": "'@timestamp'::timestamp",
}
 
# -- ADF formatDateTime format string --
_DATETIME_ADF_FORMAT_MAP = {
    "sql server": "yyyy-MM-dd HH:mm:ss.fff",
    "azure sql": "yyyy-MM-dd HH:mm:ss.fff",
    "mysql": "yyyy-MM-dd HH:mm:ss",
    "oracle": "yyyy-MM-dd HH:mm:ss.fffffff",
    "postgres": "yyyy-MM-dd HH:mm:ss",
    "postgresql": "yyyy-MM-dd HH:mm:ss",
}
 
# -- ADF timestamp SQL function for WHERE clause --
# Oracle: TO_TIMESTAMP(value, 'format')
# SQL Server: CAST(value AS datetime)
# PostgreSQL: value::timestamp
_TIMESTAMP_SQL_FUNC_MAP = {
    "sql server": "CAST(@@TIMESTAMP@@ AS datetime)",
    "azure sql": "CAST(@@TIMESTAMP@@ AS datetime)",
    "mysql": "CAST(@@TIMESTAMP@@ AS datetime)",
    "oracle": "TO_TIMESTAMP(@@TIMESTAMP@@, '@@TIMESTAMP_FORMAT@@')",
    "postgres": "@@TIMESTAMP@@::timestamp",
    "postgresql": "@@TIMESTAMP@@::timestamp",
}
 
# -- ADF timestamp format string for SQL function --
_TIMESTAMP_FORMAT_SQL_MAP = {
    "sql server": "yyyy-MM-dd HH:mm:ss",
    "azure sql": "yyyy-MM-dd HH:mm:ss",
    "mysql": "%Y-%m-%d %H:%i:%S",
    "oracle": "YYYY-MM-DD HH24:MI:SS.FF",
    "postgres": "YYYY-MM-DD HH24:MI:SS",
    "postgresql": "YYYY-MM-DD HH24:MI:SS",
}
 
 
# -- ITL pipeline deploy order (OTL must run before ITL) ---------------
_ITL_DEPLOY_ORDER = [
    "04_PL_IncrementalSourceToBronze.json",
    "05_PL_SourceDelete.json",
    "01_PL_WatermarkUpdate.json",
    "06_PL_MailTrigger.json",
    "03_PL_InvokePipeline.json",
    "02_PL_Master pipeline.json",
]
 
 
class PipelineDeployValidationError(RuntimeError):
    """Raised for pre-upload validation failures (missing notebook/dependency id, etc).
 
    Unlike transient upload errors, these must never be silently treated as
    success just because a same-named pipeline already exists in the
    workspace from a previous (possibly broken) deploy attempt.
    """
 
 
_ITL_STORED_PROCS: dict[str, str] = {
    "Replace_ETLBatchHeader_stored_procedure_name": "Log.SP_ETLBatchHeader",
    "Replace_BatchBronzeDetails_stored_procedure_name": "Log.SP_ETLBatchBronzeDetails",
    # NOTE: UpdateWaterMarkSP lives in the per-connection Config_<conn> schema, not
    # Log — it's set dynamically per connection in build_replacements(), not here.
}
 
 
# -- DB-type to OTL subfolder mapping -----------------------------------
# Maps normalised db_type strings to the correct pipelines/OTL/<subfolder>
_DB_TYPE_TO_OTL_FOLDER: dict[str, str] = {
    "sql server": "SQL",
    "azure sql": "SQL",
    "mysql": "MySQL",
    "oracle": "Oracle",
    "postgresql": "Postgres",
    "postgres": "Postgres",
}
 
 
def _get_otl_pipeline_dir(db_type: str, app_mode: str = "fabric") -> str:
    """Return the absolute path to the OTL subfolder for *db_type*.

    *app_mode* picks between the Fabric Accelerator pipelines (``OTL``) and
    the Finin Accelerator variant (``OTL_Finin``), mirroring the notebook
    module's handling — see ``notebook._get_otl_notebook_dir``.

    Falls back to the top-level OTL directory when the db_type is unknown
    so that existing behaviour is preserved for unrecognised types.
    """
    root_name = "OTL_Finin" if app_mode == "finin" else "OTL"
    subfolder = _DB_TYPE_TO_OTL_FOLDER.get(db_type.lower().strip())
    if subfolder:
        return os.path.join(_PIPELINES_DIR, root_name, subfolder)
    # Fallback: top-level OTL (walks all sub-folders)
    return os.path.join(_PIPELINES_DIR, root_name)
 
 
# -- DB-type to pipeline file mapping -----------------------------------
_PIPELINE_FILE_MAP: dict[str, list[str]] = {
    "sql server": ["01_PL_SQL_ConfigCreation.json", "02_PL_SourceToBronze.json"],
    "azure sql": ["01_PL_SQL_ConfigCreation.json", "02_PL_SourceToBronze.json"],
    "oracle": ["01_PL_Oracle_ConfigCreation.json", "02_PL_SourceToBronze.json"],
    "postgresql": ["01_PL_Postgres_ConfigCreation.json", "02_PL_SourceToBronze.json"],
    "postgres": ["01_PL_Postgres_ConfigCreation.json", "02_PL_SourceToBronze.json"],
    "mysql": ["01_PL_MySQL_ConfigCreation.json", "02_PL_SourceToBronze.json"],
}
 
 
# -- DB-type to ITL subfolder mapping -----------------------------------
# Maps normalised db_type strings to the correct pipelines/ITL/<subfolder>,
# mirroring _DB_TYPE_TO_OTL_FOLDER above so ITL pipelines are created/run
# from the source-specific folder (Oracle / SQL / Postgres) instead of a
# single shared location.
_DB_TYPE_TO_ITL_FOLDER: dict[str, str] = {
    "sql server": "SQL",
    "azure sql": "SQL",
    "mysql": "MySQL",
    "oracle": "Oracle",
    "postgresql": "Postgres",
    "postgres": "Postgres",
}


def _get_itl_pipeline_dir(db_type: str) -> str:
    """Return the absolute path to the ITL subfolder for *db_type*.

    Falls back to the top-level ITL directory when the db_type is unknown
    or blank, preserving previous behaviour for unrecognised types.
    """
    subfolder = _DB_TYPE_TO_ITL_FOLDER.get(db_type.lower().strip())
    if subfolder:
        return os.path.join(_PIPELINES_DIR, "ITL", subfolder)
    return os.path.join(_PIPELINES_DIR, "ITL")


def get_pipelines_for_db_type(db_type: str) -> list[str]:
    """Return the list of pipeline filenames to upload for the given db_type."""
    return _PIPELINE_FILE_MAP.get(db_type.lower(), ["01_PL_SQL_ConfigCreation.json", "02_PL_SourceToBronze.json"])
 
 
def build_replacements(
    token: str,
    workspace_id: str,
    source_connection: dict,
    medallion_config: dict,
) -> dict[str, str]:
    """Build the placeholder → value mapping from live Fabric metadata.
 
    Fetches warehouse ID and SQL endpoint in parallel to minimise latency.
    """
    replacements: dict[str, str] = {"Replace_Workspace_Id": workspace_id}
 
    db_type = (source_connection.get("db_type") or "").lower()
    replacements["Replace_Source_Type"] = _SOURCE_TYPE_MAP.get(db_type, "SqlServerSource")
    replacements["Replace_Source_Dataset_Type"] = _DATASET_TYPE_MAP.get(db_type, "SqlServerTable")
    # Add datetime format placeholders for ITL pipelines based on db type
    replacements["Replace_DateTime_Format"] = _DATETIME_FORMAT_MAP.get(db_type, "yyyy-MM-dd HH:mm:ss.ffffff")
    replacements["Replace_Timestamp_SQL"] = _TIMESTAMP_SQL_MAP.get(db_type, "CAST('@timestamp' AS datetimeoffset)")
    replacements["Replace_Timestamp_Function"] = _TIMESTAMP_FUNC_MAP.get(db_type, "CAST('@timestamp' AS datetime)")
    replacements["Replace_DateTime_ADF_Format"] = _DATETIME_ADF_FORMAT_MAP.get(db_type, "yyyy-MM-dd HH:mm:ss.fff")
    # Add timestamp SQL function for ADF query expressions
    replacements["Replace_Timestamp_SQL_Function"] = _TIMESTAMP_SQL_FUNC_MAP.get(db_type, "TO_TIMESTAMP('@timestamp', 'YYYY-MM-DD HH24:MI:SS.FF')")
    replacements["Replace_Timestamp_Format_SQL"] = _TIMESTAMP_FORMAT_SQL_MAP.get(db_type, "YYYY-MM-DD HH24:MI:SS.FF")
    # Add source dataset type for ITL pipelines
    replacements["Replace_Source_Dataset_Type"] = _DATASET_TYPE_MAP.get(db_type, "SqlServerTable")
    replacements["Replace_Source_Database_Name"] = source_connection.get("database") or ""
    replacements["Replace_Source_Connection_Id"] = source_connection.get("fabric_connection_id") or ""
    replacements["Replace_Source_Name"] = source_connection.get("conn_name") or ""
 
    conn_name = source_connection.get("conn_name") or ""
    replacements["Replace_ConfigSchemaName"] = f"Config_{conn_name}"
    replacements["Replace_UpdateWaterMarkSP_stored_procedure_name"] = f"Config_{conn_name}.UpdateWaterMarkSP"
    replacements["<connection_name>"] = conn_name
 
    notebook_ids = source_connection.get("notebook_ids") or {}
    logger.info("Notebook IDs for replacement: %s", notebook_ids)
    for key, val in notebook_ids.items():
        replacements[key] = val
 
    # Fetch warehouse ID and SQL endpoint in parallel
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as pool:
        wh_future = pool.submit(_get_item_id_by_name, token, workspace_id, "warehouses", "WH_MetaData")
        wh_id = wh_future.result()
    replacements["Replace_MetaData_Warehouse_Id"] = wh_id or ""
    if wh_id:
        replacements["Replace_MetaData_SQL_Endpoint"] = _get_warehouse_sql_endpoint(token, workspace_id, wh_id) or ""
    else:
        replacements["Replace_MetaData_SQL_Endpoint"] = ""
 
    bronze_item_id = medallion_config.get("bronze_item_id") or ""
    replacements["Replace_Bronze_Lakehouse_Id"] = bronze_item_id
    replacements.update(_ITL_STORED_PROCS)
    replacements["Replace_MetaData_Workspace_Id"] = workspace_id
    replacements["Replace_Source_Type"] = _SOURCE_TYPE_MAP.get(db_type, "SqlServerSource")

    # Mailbox the MailTrigger pipeline sends notifications from via Microsoft
    # Graph app-only auth (see auth.get_graph_token / send_mail_via_graph).
    # Same value for every project/connection -- one tenant-wide mailbox, no
    # per-project interactive Office365 sign-in required.
    import os
    replacements["Replace_Notification_Sender_UPN"] = (
        os.environ.get("NOTIFICATION_SENDER_UPN") or ""
    )
 
    _CRITICAL_KEYS = [
        "Replace_Workspace_Id",
        "Replace_Source_Connection_Id",
        "Replace_MetaData_Warehouse_Id",
        "Replace_MetaData_SQL_Endpoint",
        "Replace_Bronze_Lakehouse_Id",
    ]
    missing = [k for k in _CRITICAL_KEYS if not replacements.get(k)]
    if missing:
        logger.warning("Empty replacement values for: %s", missing)
 
    return replacements
 
 
def _apply_replacements(pipeline_json: dict, replacements: dict[str, str]) -> dict:
    """Recursively replace placeholder strings inside a JSON structure.
 
    Placeholders are applied longest-key-first so that a shorter token
    (e.g. Replace_Timestamp_SQL) can never partially match and corrupt a
    longer token that starts with the same text
    (e.g. Replace_Timestamp_SQL_Function).
    """
    raw = json.dumps(pipeline_json)
    for placeholder in sorted(replacements, key=len, reverse=True):
        raw = raw.replace(placeholder, replacements[placeholder])
    return json.loads(raw)
 
 
def _update_pipeline_definition(
    token: str, workspace_id: str, item_id: str, definition_body: dict
) -> bool:
    """Update an existing pipeline's definition via the Fabric API."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/items/{item_id}/updateDefinition"
    encoded = base64.b64encode(
        json.dumps(definition_body).encode("utf-8")
    ).decode("utf-8")
    payload = {
        "definition": {
            "parts": [
                {
                    "path": "pipeline-content.json",
                    "payload": encoded,
                    "payloadType": "InlineBase64",
                }
            ],
        },
    }
    resp = httpx.post(url, headers=_headers(token), json=payload, timeout=_TIMEOUT)
    print(f"[FABRIC API] Update pipeline definition {item_id} -> status {resp.status_code}")
    if resp.status_code not in (200, 202):
        print(f"[FABRIC API] Update error body: {resp.text[:2000]}")
    if resp.status_code in (200, 202):
        logger.info("Pipeline definition updated: %s", item_id)
        if resp.status_code == 202:
            location = resp.headers.get("Location") or resp.headers.get("location")
            if location:
                _poll_lro(token, location)
        return True
    logger.warning("Pipeline definition update failed (%s): %s", resp.status_code, resp.text)
    return False
 
 
def _upload_single_pipeline(
    token: str,
    workspace_id: str,
    pipeline_name: str,
    pipeline_json: dict,
    folder_id: str | None = None,
) -> dict:
    """Upload one pipeline JSON to Fabric as a DataPipeline item."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/items"
 
    # Fabric's PipelineReference.referenceName is resolved against the pipeline's
    # internal "name" field inside its own definition content — NOT the workspace
    # item's displayName. If "name" is omitted, Fabric auto-generates an internal
    # lowercase-normalized identifier, which then no longer matches the (properly
    # cased, connection-prefixed) referenceName other pipelines use to invoke it.
    # So we must set "name" here to the exact same prefixed displayName.
    if "properties" in pipeline_json:
        definition_body = {"name": pipeline_name, "properties": pipeline_json["properties"]}
    else:
        definition_body = {**pipeline_json, "name": pipeline_name}
 
    encoded = base64.b64encode(
        json.dumps(definition_body).encode("utf-8")
    ).decode("utf-8")
 
    payload: dict = {
        "displayName": pipeline_name,
        "type": "DataPipeline",
        "definition": {
            "parts": [
                {
                    "path": "pipeline-content.json",
                    "payload": encoded,
                    "payloadType": "InlineBase64",
                }
            ],
        },
    }
    if folder_id:
        payload["folderId"] = folder_id
 
    logger.info("Uploading pipeline '%s' to workspace %s (folder=%s)", pipeline_name, workspace_id, folder_id)

    # Guard against duplicate deploys: Fabric does not reliably reject a
    # second item with the same displayName (it doesn't enforce name
    # uniqueness the way the 409 branch below assumes), so a retried or
    # double-fired deploy call would otherwise create a second DataPipeline
    # item with an identical name instead of updating the first one. Check
    # up front and update in place if it already exists.
    preexisting = _find_pipeline_by_name(token, workspace_id, pipeline_name)
    if preexisting:
        logger.info("Pipeline '%s' already exists (id=%s) – updating definition instead of re-creating", pipeline_name, preexisting.get("id"))
        updated = _update_pipeline_definition(token, workspace_id, preexisting["id"], definition_body)
        if updated:
            return preexisting

    resp = httpx.post(url, headers=_headers(token), json=payload, timeout=_TIMEOUT)
    print(f"[FABRIC API] Upload pipeline '{pipeline_name}' -> status {resp.status_code}")
    if resp.status_code not in (200, 201, 202, 409):
        print(f"[FABRIC API] Error body: {resp.text[:2000]}")
    if resp.status_code == 201:
        try:
            data = resp.json()
            logger.info("Pipeline created: id=%s", data.get("id"))
            return data
        except Exception:
            return {"id": None, "displayName": pipeline_name}
    if resp.status_code in (200, 202):
        location = resp.headers.get("Location") or resp.headers.get("location")
        logger.info("LRO location: %s", location)
        if location:
            lro_result = _poll_lro(token, location)
            if lro_result:
                lro_status = (lro_result.get("status") or "").lower()
                logger.info("LRO status: %s", lro_status)
                if lro_status == "failed":
                    error_msg = lro_result.get("error", {}).get("message", "Pipeline provisioning failed")
                    raise RuntimeError(f"Pipeline provisioning failed: {error_msg}")
        # Verify pipeline actually exists in Fabric
        existing = _find_pipeline_by_name(token, workspace_id, pipeline_name)
        if existing:
            logger.info("Pipeline verified in workspace: id=%s", existing.get("id"))
            return existing
        logger.warning("Pipeline '%s' NOT found in workspace after upload (202 accepted but not created)", pipeline_name)
        try:
            resp_body = resp.json()
            logger.warning("Response body: %s", resp_body)
        except Exception:
            pass
        raise RuntimeError(f"Pipeline '{pipeline_name}' upload was accepted but pipeline was not created in Fabric. Check workspace permissions and pipeline JSON validity.")
    if resp.status_code == 409:
        # Pipeline already exists – update its definition
        existing = _find_pipeline_by_name(token, workspace_id, pipeline_name)
        if existing:
            logger.info("Pipeline already exists: id=%s – updating definition", existing.get("id"))
            updated = _update_pipeline_definition(
                token, workspace_id, existing["id"], definition_body
            )
            if updated:
                return existing
            logger.warning("Failed to update existing pipeline definition, returning as-is")
            return existing
        return {"id": None, "displayName": pipeline_name, "alreadyExists": True}
    logger.error("Pipeline upload failed (%s): %s", resp.status_code, resp.text)
    # Extract a friendlier message from the Fabric error response
    try:
        err_body = resp.json()
        err_code = err_body.get("errorCode", "")
        err_msg = err_body.get("message", resp.text)
        detail = f"Pipeline '{pipeline_name}' upload failed ({resp.status_code}): [{err_code}] {err_msg}"
    except Exception:
        detail = f"Pipeline '{pipeline_name}' upload failed ({resp.status_code}): {resp.text}"
    raise RuntimeError(detail)
 
 
def _get_pipeline_category(filename: str) -> str:
    lower = filename.lower()
    if lower.startswith("dbsource") or "dbsource_config" in lower or lower.endswith("_metadataconfig.json"):
        return "01_OTL_Metadata"
    if lower == "pl_sourcetobronze.json" or "pl_sourcetobronze" in lower:
        return "02_OTL"
    return "03_ITL"
 
 
def _ensure_pipeline_folder(
    token: str,
    workspace_id: str,
    connection_name: str,
    connection_index: int,
    category: str,
) -> str:
    """Create the implementation category pipeline folder and return the inner folder ID.
 
    Folder hierarchy:
      03_Fabric_Implementation/
        01_<connection_name>/
          01_Metadata/
            01_OTL_Metadata/
              02_Pipeline/
            02_ITL_Metadata/
              02_Pipeline/
          02_OTL/
            02_Pipeline/
          03_ITL/
            02_Pipeline/
    """
    impl = create_folder(token, workspace_id, "03_Fabric_Implementation")
    idx = str(connection_index).zfill(2)
    conn_folder = create_folder(token, workspace_id, f"{idx}_{connection_name}", impl["id"])
 
    if category == "01_OTL_Metadata":
        metadata_folder = create_folder(token, workspace_id, "01_Metadata", conn_folder["id"])
        otl_meta = create_folder(token, workspace_id, "01_OTL_Metadata", metadata_folder["id"])
        create_folder(token, workspace_id, "01_Notebook", otl_meta["id"])
        pipeline_sub = create_folder(token, workspace_id, "02_Pipeline", otl_meta["id"])
    elif category == "02_ITL_Metadata":
        metadata_folder = create_folder(token, workspace_id, "01_Metadata", conn_folder["id"])
        itl_meta = create_folder(token, workspace_id, "02_ITL_Metadata", metadata_folder["id"])
        create_folder(token, workspace_id, "01_Notebook", itl_meta["id"])
        pipeline_sub = create_folder(token, workspace_id, "02_Pipeline", itl_meta["id"])
    elif category == "02_OTL":
        otl_folder = create_folder(token, workspace_id, "02_OTL", conn_folder["id"])
        create_folder(token, workspace_id, "01_Notebook", otl_folder["id"])
        pipeline_sub = create_folder(token, workspace_id, "02_Pipeline", otl_folder["id"])
        # Also pre-create the 03_ITL structure so it's visible immediately
        itl_folder = create_folder(token, workspace_id, "03_ITL", conn_folder["id"])
        create_folder(token, workspace_id, "01_Notebook", itl_folder["id"])
        create_folder(token, workspace_id, "02_Pipeline", itl_folder["id"])
    elif category == "03_ITL":
        itl_folder = create_folder(token, workspace_id, "03_ITL", conn_folder["id"])
        create_folder(token, workspace_id, "01_Notebook", itl_folder["id"])
        pipeline_sub = create_folder(token, workspace_id, "02_Pipeline", itl_folder["id"])
    else:
        category_folder = create_folder(token, workspace_id, category, conn_folder["id"])
        pipeline_sub = create_folder(token, workspace_id, "02_Pipeline", category_folder["id"])
 
    return pipeline_sub["id"]
 
 
def upload_pipelines(
    token: str,
    workspace_id: str,
    connection_name: str,
    connection_index: int,
    replacements: dict[str, str],
    db_type: str = "",
    filenames: list[str] | None = None,
    directory: str | None = None,
    app_mode: str = "fabric",
) -> list[dict]:
    """Upload pipeline JSON files to Fabric, replacing placeholders.
 
    If *filenames* is ``None`` or empty, auto-selects based on *db_type*.
    *app_mode* selects the Fabric vs Finin pipeline variant.
    Returns a per-pipeline result list.
    """
    # Resolve the correct OTL subfolder (Oracle / SQL / Postgres) from db_type.
    # An explicit *directory* override always wins (e.g. in tests).
    if directory:
        folder = directory
    elif db_type:
        folder = _get_otl_pipeline_dir(db_type, app_mode)
    else:
        folder = os.path.join(_PIPELINES_DIR, "OTL_Finin" if app_mode == "finin" else "OTL")
 
    logger.info(
        "upload_pipelines: db_type=%r -> resolved OTL folder: %s", db_type, folder
    )
 
    if not filenames:
        if db_type:
            filenames = get_pipelines_for_db_type(db_type)
        else:
            filenames = [p["filename"] for p in list_local_pipelines(folder)]
 
    results: list[dict] = []
    for fname in filenames:
        path = os.path.join(folder, fname)
        base_name = os.path.splitext(fname)[0]
        if not os.path.isfile(path):
            # Search recursively for the file
            found = False
            for root, _dirs, files in os.walk(folder):
                if fname in files:
                    path = os.path.join(root, fname)
                    found = True
                    break
            if not found:
                results.append({"name": base_name, "status": "failed", "error": "File not found"})
                continue
        category = _get_pipeline_category(fname)
        folder_id = _ensure_pipeline_folder(
            token, workspace_id, connection_name, connection_index, category
        )
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw_json = json.load(fh)
            filled = _apply_replacements(raw_json, replacements)
            # Prefix with connection name to avoid conflicts when multiple connections exist
            original_name = filled.get("name", base_name)
            pipeline_display_name = f"{connection_name}_{original_name}"
            definition_body = {"properties": filled["properties"]} if "properties" in filled else filled
            data = _upload_single_pipeline(
                token, workspace_id, pipeline_display_name, filled, folder_id
            )
            results.append({
                "filename": fname,
                "name": pipeline_display_name,
                "status": "success",
                "id": data.get("id"),
            })
        except Exception as exc:
            # Upload may have timed out but pipeline could still be created.
            pipeline_display_name_fallback = f"{connection_name}_{base_name}"
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    raw_json = json.load(fh)
                filled = _apply_replacements(raw_json, replacements)
                pipeline_display_name_fallback = f"{connection_name}_{filled.get('name', base_name)}"
            except Exception:
                pass
            existing = _find_pipeline_by_name(token, workspace_id, pipeline_display_name_fallback)
            if existing:
                results.append({
                    "filename": fname,
                    "name": pipeline_display_name_fallback,
                    "status": "success",
                    "id": existing.get("id"),
                })
            else:
                results.append({
                    "filename": fname,
                    "name": pipeline_display_name_fallback,
                    "status": "failed",
                    "error": str(exc),
                })
 
    return results
 
 
def upload_itl_pipelines(
    token: str,
    workspace_id: str,
    connection_name: str,
    connection_index: int,
    replacements: dict[str, str],
    itl_dir: str | None = None,
    load_type: str = "",
    db_type: str = "",
) -> list[dict]:
    """Upload ITL pipelines in the required deploy order (after OTL).
 
    Deploy order: 04_PL_IncrementalSourceToBronze → 05_PL_SourceDelete → 01_PL_WatermarkUpdate
                  → 06_PL_MailTrigger → 03_PL_InvokePipeline → 02_PL_Master pipeline
 
    *load_type* is passed from the IncrementalConfigETL LoadType column and stored
    in the replacements so pipelines can reference it at runtime.
 
    *db_type* resolves the correct source-specific ITL subfolder (Oracle / SQL /
    Postgres) via _get_itl_pipeline_dir, so each source engine creates and runs
    its own pipeline templates instead of sharing a single folder. An explicit
    *itl_dir* always takes precedence over db_type-based resolution.
    """
    folder = itl_dir or _get_itl_pipeline_dir(db_type)
    logger.info(
        "upload_itl_pipelines: db_type=%r -> resolved ITL folder: %s", db_type, folder
    )
    folder_id = _ensure_pipeline_folder(
        token,
        workspace_id,
        connection_name,
        connection_index,
        "03_ITL",
    )
 
    # Inject LoadType from IncrementalConfigETL into replacements
    if load_type:
        replacements = {**replacements, "Replace_LoadType": load_type}
 
    # Display names used for lookup/logging only. The actual PipelineReference
    # placeholders get overwritten with real item GUIDs right before InvokePipeline/
    # MasterPipeline are filled (see below) — Fabric requires the item id, not name.
    incremental_name_filled = f"{connection_name}_IncrementalSourceToBronze"
    source_delete_name_filled = f"{connection_name}_SourceDelete"
    replacements = {
        **replacements,
        "Replace_Reference_IncrementalSourceToBronze_Pipeline_Name": incremental_name_filled,
        "Replace_Reference_SourceDelete_Pipeline_Name": source_delete_name_filled,
        "Replace_Invoke_Pipeline_Reference_Name": f"{connection_name}_InvokePipeline",
    }
 
    deployed_ids: dict[str, str] = {}
    results: list[dict] = []
 
    for fname in _ITL_DEPLOY_ORDER:
        path = os.path.join(folder, fname)
        base_name = os.path.splitext(fname)[0]
        if not os.path.isfile(path):
            results.append({"name": base_name, "status": "skipped", "error": "File not found"})
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw_json = json.load(fh)
 
            # Inject Notebook_Id from already-deployed 01_NB_BronzeToSilver if available
            if "Replace_Notebook_Id" not in replacements:
                expected_nb_name = f"{connection_name}_01_NB_BronzeToSilver"
                nb = _get_item_id_by_name(token, workspace_id, "notebooks", expected_nb_name)
                if nb:
                    replacements = {**replacements, "Replace_Notebook_Id": nb}
                elif "Replace_Notebook_Id" in json.dumps(raw_json):
                    # This file actually references the notebook placeholder and we
                    # couldn't resolve it — fail now with a clear message instead of
                    # sending a literal "Replace_Notebook_Id" string to Fabric, which
                    # only surfaces as a cryptic "not a valid GUID" error later.
                    raise PipelineDeployValidationError(
                        f"Cannot resolve notebook id for '{expected_nb_name}': notebook not "
                        f"found in workspace {workspace_id}. Upload ITL notebooks for this "
                        f"connection before deploying ITL pipelines."
                    )
 
            # Fabric's PipelineReference.referenceName must be the target pipeline's
            # item ID (GUID) — NOT its displayName/name. Passing a name string here
            # causes "invalid reference '<name lowercased>'" 400 errors. So resolve
            # the actual deployed item id for each dependency right before filling.
            if fname == "03_PL_InvokePipeline.json":
                for dep_fname, dep_display, placeholder in [
                    ("04_PL_IncrementalSourceToBronze.json", incremental_name_filled, "Replace_Reference_IncrementalSourceToBronze_Pipeline_Name"),
                    ("05_PL_SourceDelete.json", source_delete_name_filled, "Replace_Reference_SourceDelete_Pipeline_Name"),
                ]:
                    dep_id = deployed_ids.get(dep_fname)
                    if not dep_id:
                        existing = _find_pipeline_by_name(token, workspace_id, dep_display)
                        dep_id = existing.get("id") if existing else None
                    if not dep_id:
                        if not _wait_for_pipeline(token, workspace_id, dep_display, max_wait=120):
                            raise PipelineDeployValidationError(f"Dependency pipeline '{dep_display}' not found in Fabric after waiting. Ensure it deployed successfully before InvokePipeline.")
                        existing = _find_pipeline_by_name(token, workspace_id, dep_display)
                        dep_id = existing.get("id") if existing else None
                    if not dep_id:
                        raise PipelineDeployValidationError(f"Could not resolve item id for dependency pipeline '{dep_display}'.")
                    replacements = {**replacements, placeholder: dep_id}
            if fname == "02_PL_Master pipeline.json":
                invoke_name = f"{connection_name}_InvokePipeline"
                dep_id = deployed_ids.get("03_PL_InvokePipeline.json")
                if not dep_id:
                    existing = _find_pipeline_by_name(token, workspace_id, invoke_name)
                    dep_id = existing.get("id") if existing else None
                if not dep_id:
                    if not _wait_for_pipeline(token, workspace_id, invoke_name, max_wait=120):
                        raise PipelineDeployValidationError(f"Dependency pipeline '{invoke_name}' not found in Fabric after waiting. Ensure it deployed successfully before MasterPipeline.")
                    existing = _find_pipeline_by_name(token, workspace_id, invoke_name)
                    dep_id = existing.get("id") if existing else None
                if not dep_id:
                    raise PipelineDeployValidationError(f"Could not resolve item id for dependency pipeline '{invoke_name}'.")
                replacements = {**replacements, "Replace_Invoke_Pipeline_Reference_Name": dep_id}
 
            filled = _apply_replacements(raw_json, replacements)
            # Prefix with connection name to avoid conflicts
            original_name = filled.get("name", base_name)
            pipeline_display_name = f"{connection_name}_{original_name}"
 
            data = _upload_single_pipeline(token, workspace_id, pipeline_display_name, filled, folder_id)
            item_id = data.get("id")
            deployed_ids[fname] = item_id or ""
            results.append({"name": pipeline_display_name, "status": "success", "id": item_id})
        except PipelineDeployValidationError as exc:
            # Hard validation failure (missing notebook id, unresolved dependency,
            # etc). Never treat this as success just because a same-named pipeline
            # already exists from a previous deploy attempt — that stale pipeline
            # is exactly the broken state we're trying to fix.
            prefixed_name = f"{connection_name}_{base_name}"
            results.append({"name": prefixed_name, "status": "failed", "error": str(exc)})
        except Exception as exc:
            prefixed_name = f"{connection_name}_{base_name}"
            existing = _find_pipeline_by_name(token, workspace_id, prefixed_name)
            if existing:
                deployed_ids[fname] = existing.get("id") or ""
                results.append({"name": prefixed_name, "status": "success", "id": existing.get("id")})
            else:
                results.append({"name": prefixed_name, "status": "failed", "error": str(exc)})
 
    return results