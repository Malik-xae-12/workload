"""Data-access service for the mapping module (Azure SQL / Fabric lakehouses)."""

import re
import pyodbc
import pandas as pd
from app.modules.finin.mapping.schema import DBCredentials


def build_conn_string(creds: DBCredentials, db: str, server: str | None = None) -> str:
    """Build Azure SQL ODBC connection string."""
    server = server or creds.server
    return (
        f"Driver={{ODBC Driver 17 for SQL Server}};"
        f"Server={server},1433;Database={db};"
        "Encrypt=yes;TrustServerCertificate=no;"
        "Authentication=ActiveDirectoryServicePrincipal;"
        f"UID={creds.client_id};PWD={creds.client_secret};TenantId={creds.tenant_id};"
    )


def clean(text) -> str:
    """Normalize whitespace in text."""
    return re.sub(r"\s+", " ", str(text)).strip() if pd.notna(text) else ""


def normalize_primary_key_flag(value) -> int:
    """Convert a template primary-key indicator into a 0/1 value."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return 1 if int(value) != 0 else 0
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned in {"1", "true", "yes", "y", "t"}:
            return 1
        if cleaned in {"0", "false", "no", "n", "f", ""}:
            return 0
    try:
        return 1 if float(value) != 0 else 0
    except (TypeError, ValueError):
        return 0


def find_primary_key_column(columns) -> str | None:
    """Find the primary-key indicator column in a template schema."""
    for column in columns:
        if column is None:
            continue
        normalized = re.sub(r"[^a-z0-9]+", "", str(column).strip().lower())
        if normalized in {"isprimarykey", "primarykey", "pk", "ispk", "primarykeyindicator"}:
            return column
    return None


def build_template_dataframe(rows: list[dict]) -> pd.DataFrame:
    """Build the template DataFrame from locally-stored rows (app.db —
    see mapping/repository.py) instead of a live Fabric/ODBC query."""
    return pd.DataFrame([
        {"Table Name": r["table_name"], "Column Name": r["column_name"], "IsPrimaryKey": r["is_primary_key"]}
        for r in rows
    ])


def load_template_data(creds: DBCredentials) -> pd.DataFrame:
    """Legacy path: live ODBC load, used only when creds.template_rows is
    empty (manual/no-project mode). Prefer build_template_dataframe()."""
    with pyodbc.connect(build_conn_string(creds, creds.template_db, creds.template_server or None)) as conn:
        return pd.read_sql(f"SELECT * FROM {creds.template_table}", conn)


def load_source_data(creds: DBCredentials) -> pd.DataFrame:
    """Load source table from the source lakehouse's SQL database."""
    with pyodbc.connect(build_conn_string(creds, creds.source_db)) as conn:
        return pd.read_sql(f"SELECT * FROM {creds.source_table}", conn)


def compute_unmapped_source_columns(rows: list, source_column_datatypes: dict, table_map: dict) -> dict:
    """Group source columns never used in any accepted match.

    Naming rule: if the column's source table was aligned to a template
    table (Stage 1), the leftover columns are routed to
    "<TemplateTable>External". If the source table has no template
    alignment at all, its leftovers keep their own identity instead of
    being pooled into a shared bucket — they're routed to
    "<SourceTable>External".
    """
    source_to_template = {
        src: tmpl for tmpl, src in (table_map or {}).items() if src and src != "NO_MATCH"
    }
    mapped_source_pairs = {
        (r["mapped_source_table"], r["mapped_source_column"])
        for r in rows
        if r["status"] == "matched" and r["mapped_source_table"] != "NO_MATCH"
    }

    unmapped: dict[str, dict] = {}
    for table_name, datatype_by_column in (source_column_datatypes or {}).items():
        leftover_cols = sorted(
            col for col in datatype_by_column
            if (table_name, col) not in mapped_source_pairs
        )
        if not leftover_cols:
            continue

        target_template = source_to_template.get(table_name)
        ext_name = f"{target_template}External" if target_template else f"{table_name}External"

        bucket = unmapped.setdefault(ext_name, {"columns": []})
        for col in leftover_cols:
            bucket["columns"].append({
                "source_table": table_name,
                "source_column": col,
                "datatype": datatype_by_column[col],
            })

    return unmapped


def build_column_config_rows(rows: list, unmapped_source_columns: dict) -> list[dict]:
    """Build the flat 'ColumnConfig' row format:
    Source Table | Source Column | Target Table | Target Column | Target Data type |
    Is Extension | IsPrimaryKey
    """
    config_rows = []

    for r in rows:
        if r["status"] == "matched" and r["mapped_source_table"] != "NO_MATCH":
            config_rows.append({
                "Source Table": r["mapped_source_table"],
                "Source Column": r["mapped_source_column"],
                "Target Table": r["template_table"],
                "Target Column": r["template_column"],
                "Target Data type": r.get("mapped_source_datatype", ""),
                "Is Extension": 0,
                "IsPrimaryKey": normalize_primary_key_flag(r.get("is_primary_key", 0)),
            })

    for ext_name, payload in (unmapped_source_columns or {}).items():
        for col in payload["columns"]:
            config_rows.append({
                "Source Table": col["source_table"],
                "Source Column": col["source_column"],
                "Target Table": ext_name,
                "Target Column": col["source_column"],
                "Target Data type": col.get("datatype", ""),
                "Is Extension": 1,
                "IsPrimaryKey": 0,
            })

    return config_rows