"""Deploy and run [MasterExecuter].[sp_GoldExecute] in WH_Gold.

This procedure is the single entry point that runs every active [ims]
stored procedure listed in [WH_MetaData].[Config_Gold].[finin_gold_sp_details]
(IsActive = 1), passing @BatchId/@SilverLakehouse through to each one.

Execution is a single blocking EXEC — all the looping happens inside SQL,
inside the procedure, not in this module — so this module's job is just
to (a) deploy the schema/table/procedure once, and (b) run it while a
second, lightweight connection polls [MasterExecuter].[ExecutionLog] for
progress, which is what lets the UI show a live "X of Y stored
procedures" bar without bypassing the procedure to do the work itself.
"""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path

import pyodbc

logger = logging.getLogger(__name__)

MASTER_SQL_PATH = Path(__file__).resolve().parent.parent / "sql" / "master_executer_gold.sql"

_GO_SEPARATOR = re.compile(r"^\s*GO\s*(\d+)?\s*$", re.IGNORECASE | re.MULTILINE)
_USE_STATEMENT = re.compile(r"^\s*USE\s+\[?[\w.]+\]?\s*;?\s*$", re.IGNORECASE)


def _get_odbc_driver() -> str:
    drivers = pyodbc.drivers()
    for d in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
        if d in drivers:
            return d
    raise RuntimeError("No suitable ODBC driver found.")


def _connect(client_id: str, client_secret: str, server: str, database: str, timeout: int | None = None):
    driver = _get_odbc_driver()
    conn_str = (
        f"DRIVER={{{driver}}};SERVER={server};DATABASE={database};"
        "Authentication=ActiveDirectoryServicePrincipal;"
        f"UID={client_id};PWD={client_secret};Encrypt=yes;TrustServerCertificate=no;"
    )
    kwargs = {"autocommit": True}
    if timeout is not None:
        kwargs["timeout"] = timeout
    return pyodbc.connect(conn_str, **kwargs)


def _split_batches(text: str) -> list[str]:
    raw = _GO_SEPARATOR.split(text)
    batches: list[str] = []
    for b in raw:
        if b is None:
            continue
        if re.fullmatch(r"\d*", b.strip()):
            continue
        stripped = _USE_STATEMENT.sub("", b).strip()
        if stripped:
            batches.append(stripped)
    return batches


def deploy_master_executer(client_id: str, client_secret: str, server: str, database: str) -> dict:
    """Create the [MasterExecuter] schema, [ExecutionLog] table, and the
    [sp_GoldExecute] procedure in WH_Gold. Safe to re-run (CREATE OR ALTER /
    IF NOT EXISTS throughout)."""
    if not MASTER_SQL_PATH.exists():
        raise FileNotFoundError(f"Master executor script not found at {MASTER_SQL_PATH}")
    text = MASTER_SQL_PATH.read_text(encoding="utf-8-sig")
    batches = _split_batches(text)
    if not batches:
        raise RuntimeError("Master executor script produced no executable batches.")

    conn = _connect(client_id, client_secret, server, database)
    try:
        cursor = conn.cursor()
        for i, batch in enumerate(batches, start=1):
            try:
                cursor.execute(batch)
                while cursor.nextset():
                    pass
            except pyodbc.Error as e:
                snippet = batch.strip().splitlines()[0][:120] if batch.strip() else ""
                raise RuntimeError(f"Batch {i}/{len(batches)} failed ({snippet!r}): {e}") from e
    finally:
        conn.close()

    return {"batches_executed": len(batches)}


def get_active_sp_count(client_id: str, client_secret: str, server: str, database: str) -> int:
    """Best-effort count of active procedures from
    Config_Gold.finin_gold_sp_details, used to size the progress bar before the
    run starts. Returns 0 (not an error) if the table doesn't exist yet —
    the run itself will surface that more usefully once it actually tries."""
    try:
        conn = _connect(client_id, client_secret, server, database, timeout=15)
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM sys.tables t
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = 'Config_Gold' AND t.name = 'finin_gold_sp_details'
            """)
            if cursor.fetchone()[0] == 0:
                return 0
            cursor.execute(
                "SELECT COUNT(*) FROM [Config_Gold].[finin_gold_sp_details] WHERE isActive = 1"
            )
            row = cursor.fetchone()
            return int(row[0]) if row else 0
        finally:
            conn.close()
    except pyodbc.Error as e:
        logger.warning(f"Could not read active SP count from Config_Gold.finin_gold_sp_details: {e}")
        return 0


def run_master_execute(
    client_id: str, client_secret: str, server: str, database: str,
    batch_id: int, silver_lakehouse: str,
) -> None:
    """Blocking: EXEC [MasterExecuter].[sp_GoldExecute]. Runs until every
    active procedure has been attempted — for ~85 procedures this can take
    a while, so this is meant to run on a background thread while
    poll_execution_log() (on a separate connection) drives progress."""
    # No query timeout here — this can legitimately run long. The ODBC
    # connect timeout still applies (default), just not the query timeout.
    conn = _connect(client_id, client_secret, server, database)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "EXEC [MasterExecuter].[sp_GoldExecute] @SilverLakehouse = ?, @BatchId = ?",
            silver_lakehouse, batch_id,
        )
        while cursor.nextset():
            pass
    finally:
        conn.close()


def poll_execution_log(
    client_id: str, client_secret: str, server: str, database: str, batch_id: int,
) -> dict:
    """One snapshot of [MasterExecuter].[ExecutionLog] for this batch:
    {done, succeeded, failed, failed_names}. `done` = Success + Failed rows
    (i.e. no longer 'Running'), which is what the progress bar counts up."""
    conn = _connect(client_id, client_secret, server, database, timeout=15)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT Status, SpName FROM [MasterExecuter].[ExecutionLog]
            WHERE BatchId = ? AND Status IN ('Success', 'Failed')
            """,
            batch_id,
        )
        rows = cursor.fetchall()
        succeeded = sum(1 for r in rows if r[0] == "Success")
        failed_names = [r[1] for r in rows if r[0] == "Failed"]
        return {
            "done": len(rows),
            "succeeded": succeeded,
            "failed": len(failed_names),
            "failed_names": failed_names,
        }
    finally:
        conn.close()


def new_batch_id() -> int:
    """Matches the procedure's own default (seconds since 2020-01-01 UTC),
    generated here instead so the backend knows the id up front to poll
    against — the procedure would otherwise pick its own id internally with
    no way for the caller to learn it until the whole run finishes."""
    epoch = 1577836800  # 2020-01-01T00:00:00Z
    return int(time.time()) - epoch