"""
Generate filled pipeline + notebook with REAL values from Fabric API.

Run:  poetry run python -m tests.test_real_replacements
From:  backend/
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.fabric.services.auth import get_fabric_token
from app.modules.fabric.services.pipeline import build_replacements, _apply_replacements
from app.modules.fabric.services.notebook import build_notebook_replacements

OUTPUT_DIR = os.path.join(tempfile.gettempdir(), "fabric_test_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Real values from env / database ──────────────────────────────────


def get_credentials_from_env():
    """Get SP credentials from environment variables."""
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    client_id = os.environ.get("FABRIC_CLIENT_ID")
    client_secret = os.environ.get("FABRIC_CLIENT_SECRET")
    tenant_id = os.environ.get("FABRIC_TENANT_ID")
    if not all([client_id, client_secret, tenant_id]):
        raise RuntimeError("Set FABRIC_CLIENT_ID, FABRIC_CLIENT_SECRET, FABRIC_TENANT_ID in .env")
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "tenant_id": tenant_id,
    }


def get_workspace_id_from_db():
    """Get workspace_id from the projects table."""
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), "..", "app", "app.db")
    conn = sqlite3.connect(db_path)
    cur = conn.execute(
        "SELECT workspace_id FROM projects WHERE workspace_id IS NOT NULL LIMIT 1"
    )
    row = cur.fetchone()
    conn.close()
    if row:
        return row[0]
    raise RuntimeError("No project with workspace_id found in DB")


def get_source_connection_from_db():
    """Get first source connection from DB."""
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), "..", "app", "app.db")
    conn = sqlite3.connect(db_path)
    cur = conn.execute(
        "SELECT conn_name, db_type, database, fabric_connection_id "
        "FROM source_connections LIMIT 1"
    )
    row = cur.fetchone()
    conn.close()
    if row:
        return {
            "conn_name": row[0],
            "db_type": row[1],
            "database": row[2] or "",
            "fabric_connection_id": row[3] or "",
        }
    raise RuntimeError("No source connection found in DB")


def get_medallion_config_from_db():
    """Get medallion config from DB."""
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), "..", "app", "app.db")
    conn = sqlite3.connect(db_path)
    cur = conn.execute(
        "SELECT bronze_item_id, silver_item_id, gold_item_id "
        "FROM medallion_configs LIMIT 1"
    )
    row = cur.fetchone()
    conn.close()
    if row:
        return {
            "bronze_item_id": row[0] or "",
            "silver_item_id": row[1] or "",
            "gold_item_id": row[2] or "",
        }
    raise RuntimeError("No medallion config found in DB")


def main():
    print("=" * 60)
    print("  Real-Value Replacement Test")
    print("=" * 60)

    # Load all values from env + DB
    creds = get_credentials_from_env()
    SOURCE_CONNECTION = get_source_connection_from_db()
    MEDALLION_CONFIG = get_medallion_config_from_db()
    WORKSPACE_ID = get_workspace_id_from_db()

    print(f"\n  Loaded credentials for workspace: {WORKSPACE_ID}")
    print(f"  Source connection: {SOURCE_CONNECTION['conn_name']}")

    print(f"\n  Getting Fabric token...")
    token = get_fabric_token(creds["client_id"], creds["client_secret"], creds["tenant_id"])
    print(f"  Token acquired.\n")

    # Look up notebook ID
    import httpx
    nb_name = "Config_Creation"
    notebook_ids = {}
    try:
        resp = httpx.get(
            f"https://api.fabric.microsoft.com/v1/workspaces/{WORKSPACE_ID}/notebooks",
            headers={"Authorization": f"Bearer {token}"},
            timeout=60.0,
        )
        if resp.status_code == 200:
            for item in resp.json().get("value", []):
                if item.get("displayName") == nb_name:
                    notebook_ids["Replace_OTLMetaData_Creation_Id"] = item["id"]
                    print(f"  Found notebook '{nb_name}' -> {item['id']}")
                    break
        if "Replace_OTLMetaData_Creation_Id" not in notebook_ids:
            print(f"  WARNING: Notebook '{nb_name}' not found in workspace, using placeholder")
            notebook_ids["Replace_OTLMetaData_Creation_Id"] = "<NOTEBOOK_NOT_FOUND>"
    except Exception as e:
        print(f"  WARNING: Could not look up notebook: {e}")
        notebook_ids["Replace_OTLMetaData_Creation_Id"] = "<NOTEBOOK_LOOKUP_FAILED>"

    source_with_notebooks = {**SOURCE_CONNECTION, "notebook_ids": notebook_ids}

    # Build replacements
    print(f"\n  Building replacements from Fabric API...")
    replacements = build_replacements(
        token=token,
        workspace_id=WORKSPACE_ID,
        source_connection=source_with_notebooks,
        medallion_config=MEDALLION_CONFIG,
    )

    print(f"\n  Replacements:")
    for k, v in sorted(replacements.items()):
        display_v = v if len(v) < 80 else v[:77] + "..."
        print(f"    {k:45s} = {display_v}")

    # ── Pipeline ──
    pipeline_path = os.path.join(os.path.dirname(__file__), "..", "pipelines", "PL_1.json")
    with open(pipeline_path, "r", encoding="utf-8") as f:
        raw_pipeline = json.load(f)

    filled_pipeline = _apply_replacements(raw_pipeline, replacements)

    # Full filled JSON
    out_full = os.path.join(OUTPUT_DIR, "PL_1_real_filled.json")
    with open(out_full, "w", encoding="utf-8") as f:
        json.dump(filled_pipeline, f, indent=2)

    # Fabric payload (properties only)
    definition_body = {"properties": filled_pipeline["properties"]} if "properties" in filled_pipeline else filled_pipeline
    out_fabric = os.path.join(OUTPUT_DIR, "PL_1_real_fabric_payload.json")
    with open(out_fabric, "w", encoding="utf-8") as f:
        json.dump(definition_body, f, indent=2)

    print(f"\n  Pipeline outputs:")
    print(f"    Full:   {out_full}")
    print(f"    Fabric: {out_fabric}")
    print(f"    displayName = {filled_pipeline.get('name')}")
    variables = filled_pipeline.get("properties", {}).get("variables", {})
    print(f"    ConfigSchemaName = {variables.get('ConfigSchemaName', {}).get('defaultValue')}")

    # Check remaining placeholders
    text = json.dumps(filled_pipeline)
    remaining = [p for p in replacements if p in text]
    if remaining:
        print(f"    WARNING: unfilled placeholders: {remaining}")
    else:
        print(f"    All placeholders replaced!")

    # ── Notebook ──
    nb_path = os.path.join(os.path.dirname(__file__), "..", "notebooks", "Config_Creation.ipynb")
    with open(nb_path, "rb") as f:
        raw_nb = f.read()

    nb_replacements = build_notebook_replacements(SOURCE_CONNECTION["conn_name"])
    nb_text = raw_nb.decode("utf-8")
    for placeholder, value in nb_replacements.items():
        nb_text = nb_text.replace(placeholder, value)

    out_nb = os.path.join(OUTPUT_DIR, "Config_Creation_real_filled.ipynb")
    with open(out_nb, "w", encoding="utf-8") as f:
        f.write(nb_text)

    print(f"\n  Notebook output:")
    print(f"    {out_nb}")
    for k, v in nb_replacements.items():
        print(f"    '{k}' -> '{v}'")

    print()
    print("=" * 60)
    print("  DONE — check %TEMP%/fabric_test_output/ for files")
    print("=" * 60)


if __name__ == "__main__":
    main()
