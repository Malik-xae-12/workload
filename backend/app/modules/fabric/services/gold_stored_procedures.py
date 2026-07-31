"""Deploy the ims-schema stored procedures into WH_Gold.

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
from typing import Callable

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

# Pulls the fully-qualified procedure name out of a
# CREATE [OR ALTER] PROCEDURE [schema].[Name] ... statement, whether the
# schema/name are bracketed or not.
_PROC_NAME = re.compile(
    r"CREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE\s+"
    r"(\[?(?P<schema>[\w]+)\]?\.)?\[?(?P<name>[\w]+)\]?",
    re.IGNORECASE,
)


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


def count_batches() -> int:
    """Number of SQL batches the script will execute — used up front to size
    the progress bar before the job actually starts running."""
    return len(_load_batches())


def count_stored_procedures() -> int:
    """Number of *distinct* procedures the script defines. Deliberately
    delegates to extract_procedure_names() rather than doing its own count —
    the script has a handful of names declared twice (CREATE OR ALTER
    re-declares the same procedure later on), so a naive count of every
    CREATE PROCEDURE statement doesn't match the number of objects that
    actually end up in the database, or the row count in
    Config_Gold.finin_gold_sp_details (which is built from this same
    deduped list). Keeping both derived from one function is what keeps
    the deploy result, the UI copy, and the recorded table in agreement.
    """
    return len(extract_procedure_names())


def extract_procedure_names() -> list[str]:
    """Every stored procedure name the script creates, e.g. "ims.sp_Broker".

    Used to populate Config_Gold.finin_gold_sp_details after a successful
    deploy — read from the script itself (not from what actually got
    created) so re-running this after a partial failure still lists the
    full intended set consistently.
    """
    if not SQL_SCRIPT_PATH.exists():
        return []
    text = SQL_SCRIPT_PATH.read_text(encoding="utf-8-sig")
    names = []
    for m in _PROC_NAME.finditer(text):
        schema = m.group("schema") or "ims"
        names.append(f"{schema}.{m.group('name')}")
    # Script uses CREATE OR ALTER, so a name could legitimately appear more
    # than once if the script re-declares it later — de-dupe, keep order.
    seen: set[str] = set()
    deduped = []
    for n in names:
        if n not in seen:
            seen.add(n)
            deduped.append(n)
    return deduped


def deploy_stored_procedures(
    client_id: str,
    client_secret: str,
    server: str,
    database: str,
    on_progress: Callable[[int, int], None] | None = None,
) -> dict:
    """Execute every batch in the bundled script against `database` (WH_Gold).

    Returns {"batches_executed": int, "procedures_deployed": int}. Raises
    on the first batch failure — SQL batches from this script are mostly
    independent CREATE OR ALTER PROCEDURE statements, so a mid-script
    failure still leaves everything before it applied; the exception
    message includes which batch (1-indexed) failed so it's easy to find
    in the source file.

    *on_progress*, if given, is called as `on_progress(completed, total)`
    after each batch — this is what lets the caller drive a live progress
    bar instead of the UI just sitting on a spinner for the whole run.
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
            if on_progress:
                on_progress(i, len(batches))
    finally:
        conn.close()

    return {
        "batches_executed": len(batches),
        "procedures_deployed": count_stored_procedures(),
    }


def record_sp_details(
    client_id: str, client_secret: str, server: str, database: str, sp_names: list[str]
) -> int:
    """Record every deployed SP in Config_Gold.finin_gold_sp_details on the
    metadata warehouse (WH_MetaData), creating the schema/table if needed.

    Columns: id, sp_name, isActive — isActive is always 1 here, since this
    only ever runs right after a successful deploy of the full set.
    Re-running clears the previous rows first so the table always reflects
    exactly what's in the script, not an accumulation across runs.
    """
    if not sp_names:
        return 0

    conn = _connect(client_id, client_secret, server, database)
    try:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT COUNT(*) FROM sys.schemas WHERE name = 'Config_Gold'
        """)
        if cursor.fetchone()[0] == 0:
            cursor.execute("CREATE SCHEMA [Config_Gold]")

        cursor.execute("""
            SELECT COUNT(*) FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = 'Config_Gold' AND t.name = 'finin_gold_sp_details'
        """)
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                CREATE TABLE [Config_Gold].[finin_gold_sp_details]
                (
                    id       BIGINT IDENTITY NOT NULL,
                    sp_name  VARCHAR(255) NOT NULL,
                    isActive BIT NOT NULL
                )
            """)

        cursor.execute("TRUNCATE TABLE [Config_Gold].[finin_gold_sp_details]")

        cursor.fast_executemany = True
        cursor.executemany(
            "INSERT INTO [Config_Gold].[finin_gold_sp_details] (sp_name, isActive) VALUES (?, ?)",
            [(name, 1) for name in sp_names],
        )
    finally:
        conn.close()

    return len(sp_names)