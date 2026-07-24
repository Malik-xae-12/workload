"""SourceInformationSchemaMapped — stores Finin column-mapping results per connection.

Mirrors the physical layout of [Config_<name>].[SourceInformationSchema] and adds
the mapping-specific columns produced by the Finin mapper.
"""

import logging

import pyodbc

logger = logging.getLogger(__name__)


def read_latest_saved_mapping(
    client_id: str, client_secret: str, server: str, database: str, config_schema_name: str
) -> dict | None:
    """Read back the most recently saved mapping for this connection from
    [config_schema_name].[SourceInformationSchemaMapped], reconstructed into
    the same {job_id, rows, stats} shape a fresh mapping job produces.

    Used to resume the AI Mapping summary view for a connection that was
    already mapped in a previous visit, instead of forcing the user to
    re-run the whole mapping process just to see it again.

    Returns None if the table doesn't exist yet or has no rows for this
    connection (i.e. nothing has been saved here before).
    """
    conn = _connect(client_id, client_secret, server, database)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT COUNT(*) FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = ? AND t.name = 'SourceInformationSchemaMapped'
            """,
            config_schema_name,
        )
        if cursor.fetchone()[0] == 0:
            return None

        # Rows are only ever deleted/replaced per-JobId (see save_mapping_rows),
        # so multiple JobIds can coexist if the mapping was re-run more than
        # once. Only the most recently created JobId reflects the current
        # saved mapping.
        cursor.execute(
            f"""
            SELECT TOP 1 JobId FROM [{config_schema_name}].[SourceInformationSchemaMapped]
            ORDER BY CreatedAt DESC
            """
        )
        latest = cursor.fetchone()
        if not latest:
            return None
        job_id = latest[0]

        cursor.execute(
            f"""
            SELECT SourceTableSchema, SourceTableName, SourceColumnName, SourceDataType,
                   TargetTableName, TargetColumnName, TargetDataType, IsExtension, IsPrimaryKey,
                   MappingStatus, MappingScore, MappingReason
            FROM [{config_schema_name}].[SourceInformationSchemaMapped]
            WHERE JobId = ?
            """,
            job_id,
        )
        cols = [c[0] for c in cursor.description]
        db_rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
    finally:
        cursor.close()
        conn.close()

    if not db_rows:
        return None

    rows = []
    for r in db_rows:
        status = (r.get("MappingStatus") or "").lower()
        rows.append({
            "template_table": r.get("TargetTableName") or "",
            "template_column": r.get("TargetColumnName") or "",
            "mapped_source_table": r.get("SourceTableName") or "",
            "mapped_source_column": r.get("SourceColumnName") or "",
            "mapped_source_datatype": r.get("SourceDataType") or "",
            "mapping_score": float(r.get("MappingScore") or 0),
            # Not persisted individually when saved — the combined score is
            # the closest available approximation for these two.
            "name_similarity": float(r.get("MappingScore") or 0),
            "context_similarity": float(r.get("MappingScore") or 0),
            "gap": 0,
            "status": "matched" if status == "matched" else "unmatched",
            "reason": r.get("MappingReason") or "",
        })

    matched = sum(1 for r in rows if r["status"] == "matched")
    unmatched = len(rows) - matched
    scores = [r["mapping_score"] for r in rows if r["status"] == "matched"]
    avg_score = round(sum(scores) / len(scores), 4) if scores else 0.0
    high = sum(1 for s in scores if s >= 0.8)
    medium = sum(1 for s in scores if 0 <= s < 0.8)
    template_tables = len({r["template_table"] for r in rows})

    stats = {
        "total_templates": len(rows),
        "matched": matched,
        "unmatched": unmatched,
        "match_rate": round(matched / len(rows), 4) if rows else 0.0,
        "avg_score": avg_score,
        "template_tables": template_tables,
        "score_distribution": {"high": high, "medium": medium},
    }

    return {"job_id": job_id, "result": {"stats": stats, "rows": rows}}


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
    conn = pyodbc.connect(conn_str)
    conn.autocommit = True
    return conn


def ensure_mapped_table(
    client_id: str, client_secret: str, server: str, database: str, config_schema_name: str
) -> str:
    """Create [config_schema_name].[SourceInformationSchemaMapped] if it doesn't exist.

    Opens its own connection — kept for any other/legacy caller. save_mapping_rows()
    below does NOT call this; it does the same check on the connection it already
    has open, so a save doesn't pay for two separate AAD handshakes.
    """
    conn = _connect(client_id, client_secret, server, database)
    cursor = conn.cursor()
    try:
        return _ensure_mapped_table_on(cursor, config_schema_name)
    finally:
        cursor.close()
        conn.close()


def _ensure_mapped_table_on(cursor, config_schema_name: str) -> str:
    """Same as ensure_mapped_table(), but runs on an already-open cursor."""
    cursor.execute(
        """
        SELECT COUNT(*) FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = ? AND t.name = 'SourceInformationSchemaMapped'
        """,
        config_schema_name,
    )
    if cursor.fetchone()[0] == 1:
        return "SourceInformationSchemaMapped: already exists — skipped"

    cursor.execute(f"""
        CREATE TABLE [{config_schema_name}].[SourceInformationSchemaMapped]
        (
            Id                      BIGINT IDENTITY NOT NULL,
            JobId                   VARCHAR(64),
            SourceTableSchema       VARCHAR(255),
            SourceTableName         VARCHAR(255),
            SourceColumnName        VARCHAR(255),
            SourceDataType          VARCHAR(128),
            TargetTableName         VARCHAR(255),
            TargetColumnName        VARCHAR(255),
            TargetDataType          VARCHAR(128),
            IsExtension             BIT,
            IsPrimaryKey            BIT,
            MappingStatus           VARCHAR(32),
            MappingScore            FLOAT,
            MappingReason           VARCHAR(500),
            CreatedAt               DATETIME2(6)
        )
    """)
    return "SourceInformationSchemaMapped: created"


def save_mapping_rows(
    client_id: str,
    client_secret: str,
    server: str,
    database: str,
    config_schema_name: str,
    job_id: str,
    rows: list[dict],
    on_progress=None,
) -> int:
    """Replace any prior rows for this job_id, then insert the given mapping rows.

    Uses a single batched executemany (fast_executemany) instead of one round-trip
    per row — with a few hundred mapped columns, per-row INSERTs against a Fabric
    Warehouse endpoint (higher per-call latency than a local SQL Server) can take
    minutes; batching drops that to a couple of round-trips total.

    *on_progress*, if given, is called as ``on_progress(done, total)`` after
    each chunk is inserted, so callers can report a live percentage.
    """
    conn = _connect(client_id, client_secret, server, database)
    cursor = conn.cursor()
    try:
        _ensure_mapped_table_on(cursor, config_schema_name)

        cursor.execute(
            f"DELETE FROM [{config_schema_name}].[SourceInformationSchemaMapped] WHERE JobId = ?",
            job_id,
        )

        if not rows:
            return 0

        insert_sql = f"""
            INSERT INTO [{config_schema_name}].[SourceInformationSchemaMapped]
            (JobId, SourceTableSchema, SourceTableName, SourceColumnName, SourceDataType,
             TargetTableName, TargetColumnName, TargetDataType, IsExtension, IsPrimaryKey,
             MappingStatus, MappingScore, MappingReason, CreatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, SYSUTCDATETIME())
        """
        params = [
            (
                job_id,
                row.get("source_table_schema", ""),
                row.get("source_table", ""),
                row.get("source_column", ""),
                row.get("source_datatype", ""),
                row.get("target_table", ""),
                row.get("target_column", ""),
                row.get("target_datatype", ""),
                1 if row.get("is_extension") else 0,
                1 if row.get("is_primary_key") else 0,
                row.get("status", ""),
                float(row.get("score") or 0),
                (row.get("reason") or "")[:500],
            )
            for row in rows
        ]

        try:
            cursor.fast_executemany = True
        except AttributeError:
            pass  # older driver — falls back to the (still batched) default executemany

        CHUNK = 500
        total = len(params)
        if on_progress:
            on_progress(0, total)
        for i in range(0, total, CHUNK):
            cursor.executemany(insert_sql, params[i : i + CHUNK])
            if on_progress:
                on_progress(min(i + CHUNK, total), total)

        return len(params)
    finally:
        cursor.close()
        conn.close()