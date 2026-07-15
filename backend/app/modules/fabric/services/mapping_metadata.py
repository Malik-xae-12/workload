"""SourceInformationSchemaMapped — stores Finin column-mapping results per connection.

Mirrors the physical layout of [Config_<name>].[SourceInformationSchema] and adds
the mapping-specific columns produced by the Finin mapper.
"""

import logging

import pyodbc

logger = logging.getLogger(__name__)


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
    """Create [config_schema_name].[SourceInformationSchemaMapped] if it doesn't exist."""
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
    finally:
        cursor.close()
        conn.close()


def save_mapping_rows(
    client_id: str,
    client_secret: str,
    server: str,
    database: str,
    config_schema_name: str,
    job_id: str,
    rows: list[dict],
) -> int:
    """Replace any prior rows for this job_id, then insert the given mapping rows.

    Uses a single batched executemany (fast_executemany) instead of one round-trip
    per row — with a few hundred mapped columns, per-row INSERTs against a Fabric
    Warehouse endpoint (higher per-call latency than a local SQL Server) can take
    minutes; batching drops that to a couple of round-trips total.
    """
    ensure_mapped_table(client_id, client_secret, server, database, config_schema_name)

    conn = _connect(client_id, client_secret, server, database)
    cursor = conn.cursor()
    try:
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
        for i in range(0, len(params), CHUNK):
            cursor.executemany(insert_sql, params[i : i + CHUNK])

        return len(params)
    finally:
        cursor.close()
        conn.close()