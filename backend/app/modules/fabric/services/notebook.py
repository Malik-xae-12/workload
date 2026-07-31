import os
import base64
import time
import logging
import threading
 
import httpx
 
from app.modules.fabric.services.auth import FABRIC_API_BASE
from app.modules.fabric.services.medallion import create_folder
 
logger = logging.getLogger(__name__)
 
_TIMEOUT = httpx.Timeout(120.0, connect=10.0)
_LRO_POLL_INTERVAL = 3  # seconds between LRO status checks
_LRO_MAX_POLLS = 40     # max number of LRO polls (~120s total)
 
# Default directory for local notebooks (backend/notebooks/)
_NOTEBOOKS_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "notebooks")
)
 
# Module-level cache — populated once, invalidated only on explicit refresh
_notebooks_cache: list[dict] | None = None
_notebooks_cache_lock = threading.Lock()
 
 
def _build_notebooks_cache() -> list[dict]:
    folder = _NOTEBOOKS_DIR
    if not os.path.isdir(folder):
        return []
    seen: set[str] = set()
    result: list[dict] = []
    for root, _dirs, files in os.walk(folder):
        for fname in sorted(files):
            if fname.endswith(".ipynb") and fname not in seen:
                seen.add(fname)
                path = os.path.join(root, fname)
                result.append({"filename": fname, "name": os.path.splitext(fname)[0], "size_bytes": os.path.getsize(path)})
 
    print(result)
 
    return result
 
 
def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
 
 
def _find_notebook_by_name(
    token: str, workspace_id: str, notebook_name: str
) -> dict | None:
    """Look up a notebook by display name. Returns the item dict or None."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/notebooks"
    try:
        resp = httpx.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=_TIMEOUT,
        )
        if resp.status_code == 200:
            for item in resp.json().get("value", []):
                if item.get("displayName") == notebook_name:
                    return item
    except Exception:
        pass
    return None
 
 
def _poll_lro(token: str, location_url: str) -> dict | None:
    """Poll a Fabric long-running operation until it completes or we exceed max polls."""
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
 
 
def list_local_notebooks(directory: str | None = None) -> list[dict]:
    """Return metadata for every .ipynb file. Uses module-level cache for speed."""
    global _notebooks_cache
    if directory:
        # Custom directory — don't cache, just walk
        if not os.path.isdir(directory):
            return []
        seen: set[str] = set()
        result: list[dict] = []
        for root, _dirs, files in os.walk(directory):
            for fname in sorted(files):
                if fname.endswith(".ipynb") and fname not in seen:
                    seen.add(fname)
                    path = os.path.join(root, fname)
                    result.append({"filename": fname, "name": os.path.splitext(fname)[0], "size_bytes": os.path.getsize(path)})
        return result
    with _notebooks_cache_lock:
        if _notebooks_cache is None:
            _notebooks_cache = _build_notebooks_cache()
        return list(_notebooks_cache)
 
 
def _apply_notebook_replacements(raw_bytes: bytes, replacements: dict[str, str]) -> bytes:
    """Replace placeholder strings inside notebook JSON content."""
    if not replacements:
        return raw_bytes
    text = raw_bytes.decode("utf-8")
    for placeholder, value in replacements.items():
        text = text.replace(placeholder, value)
    return text.encode("utf-8")
 
 
def _update_notebook_definition(
    token: str, workspace_id: str, item_id: str, encoded_content: str
) -> None:
    """Update an existing notebook's definition with new content."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/items/{item_id}/updateDefinition"
    payload = {
        "definition": {
            "format": "ipynb",
            "parts": [
                {
                    "path": "notebook-content.ipynb",
                    "payload": encoded_content,
                    "payloadType": "InlineBase64",
                }
            ],
        }
    }
    resp = httpx.post(url, headers=_headers(token), json=payload, timeout=_TIMEOUT)
    if resp.status_code == 202:
        location = resp.headers.get("Location") or resp.headers.get("location")
        if location:
            _poll_lro(token, location)
    elif not resp.is_success:
        raise RuntimeError(f"Notebook definition update failed ({resp.status_code}): {resp.text}")
 
def _upload_single_notebook(
    token: str,
    workspace_id: str,
    notebook_name: str,
    file_path: str,
    folder_id: str | None = None,
    replacements: dict[str, str] | None = None,
) -> dict:
    """Upload one .ipynb file as a Fabric Notebook item."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/items"
 
    with open(file_path, "rb") as fh:
        content = fh.read()
    content = _apply_notebook_replacements(content, replacements or {})
    encoded = base64.b64encode(content).decode("utf-8")
 
    payload: dict = {
        "displayName": notebook_name,
        "type": "Notebook",
        "definition": {
            "format": "ipynb",
            "parts": [
                {
                    "path": "notebook-content.ipynb",
                    "payload": encoded,
                    "payloadType": "InlineBase64",
                }
            ],
        },
    }
    if folder_id:
        payload["folderId"] = folder_id
 
    resp = httpx.post(url, headers=_headers(token), json=payload, timeout=_TIMEOUT)
    if resp.status_code == 201:
        try:
            return resp.json()
        except Exception:
            return {"id": None, "displayName": notebook_name}
    if resp.status_code in (200, 202):
        # 202 = long-running operation; poll for completion
        location = resp.headers.get("Location") or resp.headers.get("location")
        if location:
            lro_result = _poll_lro(token, location)
            if lro_result:
                lro_status = (lro_result.get("status") or "").lower()
                if lro_status == "failed":
                    error_msg = lro_result.get("error", {}).get("message", "Notebook provisioning failed")
                    raise RuntimeError(f"Notebook provisioning failed: {error_msg}")
        # Either no LRO or LRO succeeded — verify notebook exists
        existing = _find_notebook_by_name(token, workspace_id, notebook_name)
        if existing:
            return existing
        try:
            return resp.json()
        except Exception:
            return {"id": None, "displayName": notebook_name}
    if resp.status_code == 409:
        # Notebook already exists – update its definition
        existing = _find_notebook_by_name(token, workspace_id, notebook_name)
        if existing:
            item_id = existing.get("id")
            if item_id:
                try:
                    _update_notebook_definition(token, workspace_id, item_id, encoded)
                except Exception as e:
                    logger.warning("Failed to update existing notebook %s: %s", notebook_name, e)
            return existing
        return {"id": None, "displayName": notebook_name, "alreadyExists": True}
    raise RuntimeError(f"Notebook upload failed ({resp.status_code}): {resp.text}")
 
 
def _find_or_create_connection_folder(
    token: str, workspace_id: str, connection_name: str, connection_index: int, impl_id: str
) -> dict:
    """Return the existing NN_<connection_name> folder if found, else create it."""
    import httpx as _httpx
    url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/folders"
    resp = _httpx.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if resp.status_code == 200:
        suffix = f"_{connection_name}"
        for f in resp.json().get("value", []):
            name = f.get("displayName", "")
            if name.endswith(suffix) and f.get("parentFolderId") == impl_id:
                return {"id": f["id"], "displayName": name}
    # Not found — create with the given index
    idx = str(connection_index).zfill(2)
    return create_folder(token, workspace_id, f"{idx}_{connection_name}", impl_id)


def _ensure_notebook_folder(
    token: str,
    workspace_id: str,
    connection_name: str,
    connection_index: int,
    category: str,
) -> str:
    """Create the implementation category notebook folder and return the inner folder ID.
 
    Folder hierarchy:
      03_Fabric_Implementation/
        01_<connection_name>/
          01_Metadata/
            01_OTL_Metadata/
              01_Notebook/
            02_ITL_Metadata/
              01_Notebook/
          02_OTL/
            01_Notebook/
          03_ITL/
            01_Notebook/
    """
    impl = create_folder(token, workspace_id, "03_Fabric_Implementation")

    # Find existing connection folder by suffix match (e.g. 02_ITLSQL)
    # to avoid creating a duplicate with a different index (e.g. 01_ITLSQL)
    conn = _find_or_create_connection_folder(token, workspace_id, connection_name, connection_index, impl["id"])
 
    if category == "01_OTL_Metadata":
        metadata_folder = create_folder(token, workspace_id, "01_Metadata", conn["id"])
        otl_meta = create_folder(token, workspace_id, "01_OTL_Metadata", metadata_folder["id"])
        nb_folder = create_folder(token, workspace_id, "01_Notebook", otl_meta["id"])
    elif category == "02_ITL_Metadata":
        metadata_folder = create_folder(token, workspace_id, "01_Metadata", conn["id"])
        itl_meta = create_folder(token, workspace_id, "02_ITL_Metadata", metadata_folder["id"])
        nb_folder = create_folder(token, workspace_id, "01_Notebook", itl_meta["id"])
    elif category == "02_OTL":
        otl_folder = create_folder(token, workspace_id, "02_OTL", conn["id"])
        nb_folder = create_folder(token, workspace_id, "01_Notebook", otl_folder["id"])
        # Also pre-create the 03_ITL structure so it's visible immediately
        itl_folder = create_folder(token, workspace_id, "03_ITL", conn["id"])
        create_folder(token, workspace_id, "01_Notebook", itl_folder["id"])
        create_folder(token, workspace_id, "02_Pipeline", itl_folder["id"])
    elif category == "03_ITL":
        itl_folder = create_folder(token, workspace_id, "03_ITL", conn["id"])
        nb_folder = create_folder(token, workspace_id, "01_Notebook", itl_folder["id"])
    else:
        category_folder = create_folder(token, workspace_id, category, conn["id"])
        nb_folder = create_folder(token, workspace_id, "01_Notebook", category_folder["id"])
 
    return nb_folder["id"]
 
 
def _get_notebook_category(filename: str) -> str:
    lower = filename.lower()
    if "incrementalconfigcreation" in lower or "incremental" in lower:
        return "02_ITL_Metadata"
    if "bronzetosilver" in lower:
        return "02_OTL"
    if "configcreation" in lower:
        return "01_OTL_Metadata"
    return "02_OTL"
 
 
def build_notebook_replacements(
    connection_name: str, db_type: str = "", app_mode: str = "fabric"
) -> dict[str, str]:
    """Build placeholder → value mapping for notebook content.

    *app_mode* stamps the shared 01_NB_BronzeToSilver notebook's ``AppMode``
    parameter so it reads from SourceInformationSchemaMapped (Finin) instead
    of SourceInformationSchema (Fabric) when loading metadata.
    """
    schema_name = f"Config_{connection_name}"
    return {
        "Config_<connection_name>": schema_name,
        "<connection_name>": connection_name,
        "ConfigSchemaName = ''": f"ConfigSchemaName = '{schema_name}'",
        "ConfigSchemaName =''": f"ConfigSchemaName = '{schema_name}'",
        "CofigSchemaName = ''": f"CofigSchemaName = '{schema_name}'",
        "CofigSchemaName =''": f"CofigSchemaName = '{schema_name}'",
        "AppMode = 'fabric'": f"AppMode = '{app_mode}'",
    }
 
 
# -- DB-type to OTL subfolder mapping -----------------------------------
# Mirrors the pipelines/OTL/<subfolder> structure under notebooks/OTL/
_DB_TYPE_TO_OTL_FOLDER: dict[str, str] = {
    "sql server": "SQL",
    "azure sql":  "SQL",
    "mysql":      "MySQL",
    "oracle":     "Oracle",
    "postgresql": "Postgres",
    "postgres":   "Postgres",
}
 
 
def _get_otl_notebook_dir(db_type: str, app_mode: str = "fabric") -> str:
    """Return the absolute path to the OTL notebook subfolder for *db_type*.

    *app_mode* picks between the Fabric Accelerator notebooks (``OTL``) and
    the Finin Accelerator variant (``OTL_Finin``) — same filenames, kept in a
    parallel folder so each accelerator's notebook content can diverge
    independently.

    Falls back to the top-level notebooks directory when the db_type is
    unknown, preserving existing behaviour for unrecognised types.
    """
    root_name = "OTL_Finin" if app_mode == "finin" else "OTL"
    subfolder = _DB_TYPE_TO_OTL_FOLDER.get(db_type.lower().strip())
    if subfolder:
        return os.path.join(_NOTEBOOKS_DIR, root_name, subfolder)
    return _NOTEBOOKS_DIR


def _get_bronze_silver_dir(app_mode: str = "fabric") -> str:
    """Return the absolute path to the folder holding 01_NB_BronzeToSilver.ipynb.

    Fabric mode reads from ``Bronze_Silver/`` (splits nothing — one bronze
    table maps to one silver table via SourceInformationSchema). Finin mode
    reads from ``Bronze_Silver_Finin/``, whose variant fans a single bronze
    table out into one-or-more silver tables per
    SourceInformationSchemaMapped's TargetTableName grouping.

    This is resolved explicitly (rather than left to the directory walk
    fallback used for other shared notebooks) because both folders contain a
    file with the identical name, and the walk would otherwise pick whichever
    one it encounters first regardless of app_mode.
    """
    root_name = "Bronze_Silver_Finin" if app_mode == "finin" else "Bronze_Silver"
    return os.path.join(_NOTEBOOKS_DIR, root_name)
 
 
# -- DB-type to notebook file mapping -----------------------------------
_NOTEBOOK_FILE_MAP: dict[str, list[str]] = {
    "sql server": ["01_NB_SQL_ConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "azure sql": ["01_NB_SQL_ConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "oracle": ["01_NB_Oracle_ConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "postgresql": ["01_NB_Postgres_ConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "postgres": ["01_NB_Postgres_ConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "mysql": ["01_NB_MySQL_ConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "azure blob": [],
}
 
_ITL_NOTEBOOK_FILE_MAP: dict[str, list[str]] = {
    "sql server": ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "azure sql": ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "oracle": ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "postgresql": ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "postgres": ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "mysql": ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"],
    "azure blob": [],
}


def run_fabric_notebook(
    token: str,
    workspace_id: str,
    notebook_item_id: str,
    parameters: dict | None = None,
) -> str | None:
    """Trigger a Fabric notebook run and return the job instance ID."""
    url = (
        f"{FABRIC_API_BASE}/workspaces/{workspace_id}"
        f"/items/{notebook_item_id}/jobs/instances?jobType=RunNotebook"
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
        logger.info("Notebook run started: job_id=%s", job_id)
        return job_id

    logger.error(
        "Failed to start notebook run (%s): %s", resp.status_code, resp.text
    )
    raise RuntimeError(
        f"Failed to start notebook run ({resp.status_code}): {resp.text}"
    )


def get_notebook_job_status(
    token: str,
    workspace_id: str,
    notebook_item_id: str,
    job_id: str,
) -> dict:
    """Check the status of a notebook job instance."""
    url = (
        f"{FABRIC_API_BASE}/workspaces/{workspace_id}"
        f"/items/{notebook_item_id}/jobs/instances/{job_id}"
    )
    resp = httpx.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=_TIMEOUT,
    )
    if resp.status_code not in (200, 202):
        logger.warning(
            "Notebook job status check failed (%s): %s", resp.status_code, resp.text
        )
        return {"status": "failed", "job_id": job_id}

    data = resp.json()
    status = (data.get("status") or "").lower()
    logger.info("Notebook job %s status: %s", job_id, status)
    if status == "completed":
        return {"status": "completed", "job_id": job_id}
    if status in ("failed", "error", "cancelled"):
        fail_error = data.get("failureReason") or data.get("error", {})
        logger.error(
            "Notebook job %s reached terminal state '%s': %s",
            job_id, status, fail_error,
        )
        return {"status": status, "job_id": job_id, "error": str(fail_error) if fail_error else None}
    return {"status": "in_progress", "job_id": job_id}


def list_workspace_notebooks(token: str, workspace_id: str) -> list[dict]:
    """List all Notebook items in the Fabric workspace."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/items?type=Notebook"
    resp = httpx.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=_TIMEOUT,
    )
    if resp.status_code != 200:
        logger.warning("Failed to list workspace notebooks: %s %s", resp.status_code, resp.text)
        return []
    items = resp.json().get("value", [])
    return [
        {"id": item["id"], "displayName": item.get("displayName", item["id"]), "type": "Notebook"}
        for item in items
    ]
 
 
def get_notebooks_for_db_type(db_type: str) -> list[str]:
    """Return the list of notebook filenames to upload for the given db_type."""
    return _NOTEBOOK_FILE_MAP.get(db_type.lower(), ["01_NB_SQL_ConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"])
 
 
def upload_notebooks(
    token: str,
    workspace_id: str,
    connection_name: str,
    connection_index: int = 1,
    db_type: str = "",
    filenames: list[str] | None = None,
    directory: str | None = None,
    app_mode: str = "fabric",
) -> list[dict]:
    """Upload notebooks to Fabric under the standard folder hierarchy.
 
    If *filenames* is ``None``, auto-selects based on *db_type*.
    *app_mode* selects the Fabric vs Finin notebook variant (see
    ``_get_otl_notebook_dir``).
    Returns a per-notebook result list.
    """
    # Resolve the correct OTL subfolder (Oracle / SQL / Postgres) from db_type.
    # An explicit *directory* override always wins (e.g. in tests).
    if directory:
        folder = directory
    elif db_type:
        folder = _get_otl_notebook_dir(db_type, app_mode)
    else:
        folder = _NOTEBOOKS_DIR
 
    logger.info(
        "upload_notebooks: db_type=%r -> resolved OTL folder: %s", db_type, folder
    )
 
    replacements = build_notebook_replacements(connection_name, db_type, app_mode)
 
    if filenames is None:
        if db_type:
            filenames = get_notebooks_for_db_type(db_type)
        else:
            filenames = [nb["filename"] for nb in list_local_notebooks(folder)]
 
    results: list[dict] = []
    for fname in filenames:
        if fname == "01_NB_BronzeToSilver.ipynb":
            # Explicit resolution: don't rely on the walk fallback below, since
            # both Bronze_Silver/ and Bronze_Silver_Finin/ contain a file with
            # this exact name.
            path = os.path.join(_get_bronze_silver_dir(app_mode), fname)
        else:
            path = os.path.join(folder, fname)
        base_name = os.path.splitext(fname)[0]
        # Prefix with connection name to avoid conflicts when multiple connections exist
        display_name = f"{connection_name}_{base_name}"
        if not os.path.isfile(path):
            # Search within the resolved subfolder first, then fall back to the
            # full notebooks root so shared files (e.g. 01_NB_BronzeToSilver.ipynb) are found.
            found = False
            for search_root in (folder, _NOTEBOOKS_DIR):
                for root, _dirs, files in os.walk(search_root):
                    if fname in files:
                        path = os.path.join(root, fname)
                        found = True
                        break
                if found:
                    break
            if not found:
                results.append({"name": display_name, "status": "failed", "error": "File not found"})
                continue
        category = _get_notebook_category(fname)
        try:
            folder_id = _ensure_notebook_folder(
                token,
                workspace_id,
                connection_name,
                connection_index,
                category,
            )
        except Exception as exc:
            logger.error("Folder creation failed for %s (category=%s): %s", display_name, category, exc)
            results.append({"name": display_name, "status": "failed", "error": f"Folder creation failed: {exc}"})
            continue
        try:
            data = _upload_single_notebook(token, workspace_id, display_name, path, folder_id, replacements)
            results.append({"name": display_name, "status": "success", "id": data.get("id")})
        except Exception as exc:
            logger.error("Notebook upload failed for %s: %s", display_name, exc)
            # Upload may have timed out but notebook could still be created
            # in Fabric. Verify before reporting failure.
            existing = _find_notebook_by_name(token, workspace_id, display_name)
            if existing:
                results.append({"name": display_name, "status": "success", "id": existing.get("id")})
            else:
                results.append({"name": display_name, "status": "failed", "error": str(exc)})
 
    return results
 
 
def get_itl_notebooks_for_db_type(db_type: str) -> list[str]:
    """Return the list of ITL notebook filenames to upload for the given db_type."""
    return _ITL_NOTEBOOK_FILE_MAP.get(db_type.lower(), ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"])
 
 
def upload_itl_notebooks(
    token: str,
    workspace_id: str,
    connection_name: str,
    connection_index: int = 1,
    db_type: str = "",
    filenames: list[str] | None = None,
    directory: str | None = None,
    app_mode: str = "fabric",
) -> list[dict]:
    """Upload ITL notebooks to Fabric under the ITL folder hierarchy.
 
    01_NB_IncrementalConfigCreation → 01_Metadata/02_ITL_Metadata/01_Notebook
    01_NB_BronzeToSilver → 03_ITL/01_Notebook

    *app_mode* is forwarded to build_notebook_replacements so the shared
    01_NB_BronzeToSilver notebook's AppMode parameter is stamped correctly.
    """
    # ITL notebooks live flat in notebooks/ITL/ (no db_type subfoldering).
    # An explicit *directory* override always wins (e.g. in tests).
    _itl_dir = os.path.join(_NOTEBOOKS_DIR, "ITL")
    if directory:
        folder = directory
    else:
        folder = _itl_dir
 
    logger.info(
        "upload_itl_notebooks: db_type=%r -> resolved ITL folder: %s", db_type, folder
    )
 
    replacements = build_notebook_replacements(connection_name, db_type, app_mode)
 
    if filenames is None:
        if db_type:
            filenames = get_itl_notebooks_for_db_type(db_type)
        else:
            filenames = ["01_NB_IncrementalConfigCreation.ipynb", "01_NB_BronzeToSilver.ipynb"]
 
    results: list[dict] = []
    for fname in filenames:
        if fname == "01_NB_BronzeToSilver.ipynb":
            # Explicit resolution: don't rely on the walk fallback below, since
            # both Bronze_Silver/ and Bronze_Silver_Finin/ contain a file with
            # this exact name.
            path = os.path.join(_get_bronze_silver_dir(app_mode), fname)
        else:
            path = os.path.join(folder, fname)
        base_name = os.path.splitext(fname)[0]
        # Prefix with connection name to avoid conflicts when multiple connections exist
        display_name = f"{connection_name}_{base_name}"
        if not os.path.isfile(path):
            # Search within ITL dir first, then fall back to full notebooks root
            # so 01_NB_BronzeToSilver.ipynb (lives in Bronze_Silver/) is still found.
            found = False
            for search_root in (folder, _NOTEBOOKS_DIR):
                for root, _dirs, files in os.walk(search_root):
                    if fname in files:
                        path = os.path.join(root, fname)
                        found = True
                        break
                if found:
                    break
            if not found:
                results.append({"name": display_name, "status": "failed", "error": "File not found"})
                continue
 
        # Route to correct folder
        lower = fname.lower()
        if "incrementalconfigcreation" in lower or "incremental" in lower:
            category = "02_ITL_Metadata"
        else:
            category = "03_ITL"
 
        try:
            folder_id = _ensure_notebook_folder(
                token,
                workspace_id,
                connection_name,
                connection_index,
                category,
            )
        except Exception as exc:
            logger.error("Folder creation failed for %s (category=%s): %s", display_name, category, exc)
            results.append({"name": display_name, "status": "failed", "error": f"Folder creation failed: {exc}"})
            continue
        try:
            data = _upload_single_notebook(token, workspace_id, display_name, path, folder_id, replacements)
            results.append({"name": display_name, "status": "success", "id": data.get("id")})
        except Exception as exc:
            logger.error("Notebook upload failed for %s: %s", display_name, exc)
            existing = _find_notebook_by_name(token, workspace_id, display_name)
            if existing:
                results.append({"name": display_name, "status": "success", "id": existing.get("id")})
            else:
                results.append({"name": display_name, "status": "failed", "error": str(exc)})
 
    return results