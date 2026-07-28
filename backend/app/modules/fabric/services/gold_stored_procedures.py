"""Deploy the 89 ims-schema stored procedures into WH_Gold.

Runs the bundled Combined_SP_Deployment_ims.sql script (client-provided,
SPDX-free, ~12k lines) directly against the Gold warehouse over the same
AAD-service-principal ODBC connection Finin/ITL already use elsewhere in
this module. Batches are split on GO separators, the same way SSMS/sqlcmd
would run the script, since pyodbc executes one batch per call.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import pyodbc

logger = logging.getLogger(__name__)

SQL_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "sql" / "combined_sp_deployment_ims.sql"

# Matches a batch separator line: just "GO" (case-insensitive), optionally
# with trailing whitespace/count — the SSMS/sqlcmd convention, and what the
# uploaded script actually uses throughout.
_GO_SEPARATOR = re.compile(r"^\s*GO\s*(\d+)?\s*$", re.IGNORECASE | re.MULTILINE)

# Strips a leading "USE [Database];" batch — our ODBC connection already
# targets the right database directly via DATABASE=, and Fabric Warehouse's
# T-SQL surface doesn't support cross-database USE the way box SQL Server
# does, so keeping it would just fail the first batch.
_USE_STATEMENT = re.compile(r"^\s*USE\s+\[?[\w.]+\]?\s*;?\s*$", re.IGNORECASE)


def _get_odbc_driver() -> str:
    drivers = pyodbc.drivers()
    for d in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
        if d in drivers:
            return d
    raise RuntimeError("No suitable ODBC driver found.")


def _connect(client_id: str, client_secret: str, server: str, database: str):
    driver = _get_odbc_driver()
    conn_str = (
        f"DRIVER={{{driver}}};SERVER={server};DATABASE={database};"
        "Authentication=ActiveDirectoryServicePrincipal;"
        f"UID={client_id};PWD={client_secret};Encrypt=yes;TrustServerCertificate=no;"
    )
    return pyodbc.connect(conn_str, autocommit=True)


def _load_batches() -> list[str]:
    if not SQL_SCRIPT_PATH.exists():
        raise FileNotFoundError(f"Stored procedure script not found at {SQL_SCRIPT_PATH}")
    text = SQL_SCRIPT_PATH.read_text(encoding="utf-8-sig")
    raw_batches = _GO_SEPARATOR.split(text)
    batches: list[str] = []
    for b in raw_batches:
        if b is None:
            continue
        # _GO_SEPARATOR has a capture group (the optional repeat count), so
        # re.split() also yields those group matches (usually None) — skip
        # anything that isn't actual script text.
        if re.fullmatch(r"\d*", b.strip()):
            continue
        stripped = _USE_STATEMENT.sub("", b).strip()
        if stripped:
            batches.append(stripped)
    return batches


def count_stored_procedures() -> int:
    if not SQL_SCRIPT_PATH.exists():
        return 0
    text = SQL_SCRIPT_PATH.read_text(encoding="utf-8-sig")
    return len(re.findall(r"CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE", text, re.IGNORECASE))


def deploy_stored_procedures(
    client_id: str, client_secret: str, server: str, database: str
) -> dict:
    """Execute every batch in the bundled script against `database` (WH_Gold).

    Returns {"batches_executed": int, "procedures_deployed": int}. Raises
    on the first batch failure — SQL batches from this script are mostly
    independent CREATE OR ALTER PROCEDURE statements, so a mid-script
    failure still leaves everything before it applied; the exception
    message includes which batch (1-indexed) failed so it's easy to find
    in the source file.
    """
    batches = _load_batches()
    if not batches:
        raise RuntimeError("Stored procedure script produced no executable batches.")

    conn = _connect(client_id, client_secret, server, database)
    try:
        cursor = conn.cursor()
        for i, batch in enumerate(batches, start=1):
            try:
                cursor.execute(batch)
                # A batch can contain multiple result sets (e.g. PRINT +
                # a statement) — drain them so the next execute() doesn't
                # trip over a pending result.
                while cursor.nextset():
                    pass
            except pyodbc.Error as e:
                snippet = batch.strip().splitlines()[0][:120] if batch.strip() else ""
                raise RuntimeError(
                    f"Batch {i}/{len(batches)} failed ({snippet!r}): {e}"
                ) from e
    finally:
        conn.close()

    return {
        "batches_executed": len(batches),
        "procedures_deployed": count_stored_procedures(),
    }