import pyodbc
import httpx

from app.modules.fabric.services.auth import FABRIC_API_BASE
from app.modules.fabric.services.medallion import (
    create_folder,
    create_item,
    get_folder_id,
    _get_item_id,
)

_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def get_warehouse_connection_string(
    token: str, workspace_id: str, warehouse_id: str
) -> tuple[str, str]:
    """Return (connection_string, warehouse_display_name) for the given warehouse."""
    url = f"{FABRIC_API_BASE}/workspaces/{workspace_id}/warehouses/{warehouse_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(url, headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    display_name = data.get("displayName", "")
    props = data.get("properties", {})
    conn_str = props.get("connectionString") or props.get("connectionInfo")
    if not conn_str:
        raise ValueError("No SQL endpoint found for warehouse")
    return conn_str, display_name


def _execute_if_not_exists(
    cursor, label: str, check_sql: str, create_sql: str
) -> str:
    """Check existence first, then create if not found. Returns status message."""
    cursor.execute(check_sql)
    row = cursor.fetchone()
    if row and row[0] == 1:
        return f"{label}: already exists — skipped"
    cursor.execute(create_sql)
    return f"{label}: created"


def create_log_objects(
    client_id: str, client_secret: str, server: str, database: str
) -> list[str]:
    """Connect to the Fabric Warehouse via ODBC and create the Log schema,
    tables, and stored procedures needed for ETL tracking.

    Returns a list of status messages for each object.
    """
    drivers = pyodbc.drivers()
    driver_name = "ODBC Driver 18 for SQL Server"
    if driver_name not in drivers:
        driver_name = "ODBC Driver 17 for SQL Server"
        if driver_name not in drivers:
            raise RuntimeError(
                "No suitable ODBC driver found. Install 'ODBC Driver 17 for SQL Server' or '18'."
            )

    conn_str = (
        f"DRIVER={{{driver_name}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        "Authentication=ActiveDirectoryServicePrincipal;"
        f"UID={client_id};"
        f"PWD={client_secret};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
    )

    conn = pyodbc.connect(conn_str)
    conn.autocommit = True  # Required for DDL in Fabric Warehouse
    cursor = conn.cursor()
    messages: list[str] = []

    try:
        # Schema
        messages.append(
            _execute_if_not_exists(
                cursor,
                "SCHEMA: Log",
                "SELECT COUNT(*) FROM sys.schemas WHERE name = 'Log'",
                "CREATE SCHEMA Log",
            )
        )

        # Table: ETLBatchHeader
        messages.append(
            _execute_if_not_exists(
                cursor,
                "TABLE: Log.ETLBatchHeader",
                """
                SELECT COUNT(*) FROM sys.tables t
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = 'Log' AND t.name = 'ETLBatchHeader'
                """,
                """
                CREATE TABLE Log.ETLBatchHeader
                (
                    BatchId             INT             NOT NULL,
                    PipelineName        VARCHAR(255),
                    PipelineRunId       VARCHAR(255),
                    StartTime           DATETIME2(6),
                    EndTime             DATETIME2(6),
                    DurationInMinutes   INT,
                    Status              VARCHAR(255),
                    ErrorMessage        VARCHAR(600)
                )
                """,
            )
        )

        # Table: ETLBatchBronzeDetails
        messages.append(
            _execute_if_not_exists(
                cursor,
                "TABLE: Log.ETLBatchBronzeDetails",
                """
                SELECT COUNT(*) FROM sys.tables t
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = 'Log' AND t.name = 'ETLBatchBronzeDetails'
                """,
                """
                CREATE TABLE Log.ETLBatchBronzeDetails
                (
                    BatchId                 INT,
                    TableName               VARCHAR(255),
                    TableId                 INT,
                    SchemaName              VARCHAR(255),
                    ExtractedRowCount       BIGINT,
                    StartTime               DATETIME2(6),
                    EndTime                 DATETIME2(6),
                    Status                  VARCHAR(255),
                    ErrorMessage            VARCHAR(8000),
                    SourceName              VARCHAR(255)
                )
                """,
            )
        )

        # Table: ETLBatchGoldLogDetails
        messages.append(
            _execute_if_not_exists(
                cursor,
                "TABLE: Log.ETLBatchGoldLogDetails",
                """
                SELECT COUNT(*) FROM sys.tables t
                JOIN sys.schemas s ON t.schema_id = s.schema_id
                WHERE s.name = 'Log' AND t.name = 'ETLBatchGoldLogDetails'
                """,
                """
                CREATE TABLE Log.ETLBatchGoldLogDetails
                (
                    BatchId                 INT,
                    SchemaName              VARCHAR(255),
                    TableName               VARCHAR(255),
                    ProcessedRowCount       BIGINT,
                    StartTime               DATETIME2(6),
                    EndTime                 DATETIME2(6),
                    Status                  VARCHAR(255),
                    ErrorMessage            VARCHAR(8000),
                    SourceName              VARCHAR(255)
                )
                """,
            )
        )

        # Procedure: SP_ETLBatchHeader
        messages.append(
            _execute_if_not_exists(
                cursor,
                "PROCEDURE: Log.SP_ETLBatchHeader",
                """
                SELECT COUNT(*) FROM sys.procedures p
                JOIN sys.schemas s ON p.schema_id = s.schema_id
                WHERE s.name = 'Log' AND p.name = 'SP_ETLBatchHeader'
                """,
                """
                CREATE PROCEDURE Log.SP_ETLBatchHeader
                    @PipelineName   VARCHAR(255),
                    @PipelineRunId  VARCHAR(255),
                    @StartTime      DATETIME2(6) = NULL,
                    @EndTime        DATETIME2(6) = NULL,
                    @Status         VARCHAR(255) = NULL,
                    @ErrorMessage   VARCHAR(600) = NULL,
                    @BatchId        INT          = NULL
                AS
                BEGIN
                    DECLARE @DurationInMinutes   INT;
                    DECLARE @ExistingStartTime   DATETIME2(6);
                    DECLARE @NewBatchId          INT;

                    IF @BatchId IS NOT NULL
                    BEGIN
                        SELECT @ExistingStartTime = StartTime
                        FROM Log.ETLBatchHeader
                        WHERE BatchId = @BatchId;

                        IF @ExistingStartTime IS NULL
                        BEGIN
                            THROW 50000, 'Invalid BatchId', 1;
                        END

                        IF @EndTime IS NOT NULL
                        BEGIN
                            SET @DurationInMinutes = DATEDIFF(MINUTE, @ExistingStartTime, @EndTime);
                        END

                        UPDATE Log.ETLBatchHeader
                        SET
                            EndTime           = @EndTime,
                            Status            = @Status,
                            DurationInMinutes = @DurationInMinutes,
                            ErrorMessage      = @ErrorMessage
                        WHERE BatchId = @BatchId;

                        SELECT @BatchId AS BatchId;
                    END
                    ELSE
                    BEGIN
                        SELECT @NewBatchId = COALESCE(MAX(BatchId), 0) + 1
                        FROM Log.ETLBatchHeader;

                        IF @StartTime IS NOT NULL AND @EndTime IS NOT NULL
                        BEGIN
                            SET @DurationInMinutes = DATEDIFF(MINUTE, @StartTime, @EndTime);
                        END

                        INSERT INTO Log.ETLBatchHeader
                        (BatchId, PipelineName, PipelineRunId, StartTime, EndTime,
                         DurationInMinutes, Status, ErrorMessage)
                        VALUES
                        (@NewBatchId, @PipelineName, @PipelineRunId, @StartTime, @EndTime,
                         @DurationInMinutes, COALESCE(@Status, 'In-Progress'), @ErrorMessage);

                        SELECT @NewBatchId AS BatchId;
                    END
                END
                """,
            )
        )

        # Procedure: SP_ETLBatchBronzeDetails
        messages.append(
            _execute_if_not_exists(
                cursor,
                "PROCEDURE: Log.SP_ETLBatchBronzeDetails",
                """
                SELECT COUNT(*) FROM sys.procedures p
                JOIN sys.schemas s ON p.schema_id = s.schema_id
                WHERE s.name = 'Log' AND p.name = 'SP_ETLBatchBronzeDetails'
                """,
                """
                CREATE PROCEDURE Log.SP_ETLBatchBronzeDetails
                    @BatchId                INT,
                    @TableName              VARCHAR(255),
                    @TableId                INT,
                    @SchemaName             VARCHAR(255),
                    @ExtractedRowCount      BIGINT          = NULL,
                    @StartTime              DATETIME2(6)    = NULL,
                    @EndTime                DATETIME2(6)    = NULL,
                    @Status                 VARCHAR(255)    = NULL,
                    @ErrorMessage           VARCHAR(8000)   = NULL,
                    @SourceName             VARCHAR(255)
                AS
                BEGIN
                    INSERT INTO Log.ETLBatchBronzeDetails
                    (BatchId, TableName, SchemaName, ExtractedRowCount,
                     StartTime, EndTime, Status, ErrorMessage, SourceName, TableId)
                    VALUES
                    (@BatchId, @TableName, @SchemaName, @ExtractedRowCount,
                     @StartTime, @EndTime, @Status, @ErrorMessage, @SourceName, @TableId);
                END
                """,
            )
        )

        # Procedure: SP_ETLBatchGoldLogDetails
        messages.append(
            _execute_if_not_exists(
                cursor,
                "PROCEDURE: Log.SP_ETLBatchGoldLogDetails",
                """
                SELECT COUNT(*) FROM sys.procedures p
                JOIN sys.schemas s ON p.schema_id = s.schema_id
                WHERE s.name = 'Log' AND p.name = 'SP_ETLBatchGoldLogDetails'
                """,
                """
                CREATE PROCEDURE Log.SP_ETLBatchGoldLogDetails
                    @BatchId                INT,
                    @SchemaName             VARCHAR(255),
                    @TableName              VARCHAR(255),
                    @ProcessedRowCount      BIGINT          = NULL,
                    @StartTime              DATETIME2(6)    = NULL,
                    @EndTime                DATETIME2(6)    = NULL,
                    @Status                 VARCHAR(255)    = NULL,
                    @ErrorMessage           VARCHAR(8000)   = NULL,
                    @SourceName             VARCHAR(255)
                AS
                BEGIN
                    INSERT INTO Log.ETLBatchGoldLogDetails
                    (BatchId, SchemaName, TableName, ProcessedRowCount,
                     StartTime, EndTime, Status, ErrorMessage, SourceName)
                    VALUES
                    (@BatchId, @SchemaName, @TableName, @ProcessedRowCount,
                     @StartTime, @EndTime, @Status, @ErrorMessage, @SourceName);
                END
                """,
            )
        )

    finally:
        cursor.close()
        conn.close()

    return messages


def setup_metadata_layer(
    token: str,
    workspace_id: str,
    client_id: str,
    client_secret: str,
    action: str = "create_metadata",
) -> dict:
    """Create the metadata warehouse and/or log objects.

    Actions:
        create_metadata – creates the 02_Metadata folder and WH_MetaData warehouse.
        create_log      – connects to WH_MetaData via ODBC and creates the Log
                          schema, tables, and stored procedures.
    """
    meta_id = get_folder_id(token, workspace_id, "02_Metadata")
    if not meta_id:
        meta = create_folder(token, workspace_id, "02_Metadata")
        meta_id = meta["id"]

    if action == "create_metadata":
        wh = create_item(
            token, workspace_id, "warehouse", "WH_MetaData",
            "Central metadata storage", meta_id,
        )
        if not wh or "id" not in wh:
            raise ValueError("Warehouse creation returned invalid response")
        return {
            "status": "success",
            "warehouse_id": wh["id"],
            "message": "Metadata Warehouse created successfully",
        }

    elif action == "create_log":
        wh_id = _get_item_id(token, workspace_id, "warehouse", "WH_MetaData")
        if not wh_id:
            raise ValueError(
                "Metadata Warehouse not found. Run create_metadata first."
            )

        server, database = get_warehouse_connection_string(
            token, workspace_id, wh_id
        )
        results = create_log_objects(client_id, client_secret, server, database)
        return {
            "status": "success",
            "details": results,
            "message": "Log objects (schema, tables, procedures) created successfully",
        }

    else:
        raise ValueError(f"Invalid action: {action}")


# ── Source → Bronze table selection ─────────────────────────────────────
#
# The OTL config-creation notebook (01_NB_*_ConfigCreation) discovers every
# table in a source connection via INFORMATION_SCHEMA and inserts one row
# per table into WH_MetaData.Config_<connection_name>.OneTimeConfigETL,
# with IsActive defaulted to '1' for all of them — that's why every table
# moves from source to Bronze today. Flipping IsActive to '0' for
# unwanted tables here is exactly what the Bronze-copy pipeline/notebook
# already respects; no pipeline changes needed, just a way to edit this
# table's IsActive column.


def _connect_warehouse(client_id: str, client_secret: str, server: str, database: str):
    drivers = pyodbc.drivers()
    driver_name = "ODBC Driver 18 for SQL Server"
    if driver_name not in drivers:
        driver_name = "ODBC Driver 17 for SQL Server"
        if driver_name not in drivers:
            raise RuntimeError(
                "No suitable ODBC driver found. Install 'ODBC Driver 17 for SQL Server' or '18'."
            )
    conn_str = (
        f"DRIVER={{{driver_name}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        "Authentication=ActiveDirectoryServicePrincipal;"
        f"UID={client_id};"
        f"PWD={client_secret};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
    )
    return pyodbc.connect(conn_str, autocommit=True)


def list_source_tables(
    client_id: str, client_secret: str, server: str, database: str, connection_name: str,
) -> list[dict]:
    """List every table discovered for *connection_name* in its
    OneTimeConfigETL config table, with current IsActive state."""
    config_schema = f"Config_{connection_name}"
    conn = _connect_warehouse(client_id, client_secret, server, database)
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT COUNT(*) FROM sys.schemas WHERE name = ?", (config_schema,)
        )
        if cursor.fetchone()[0] != 1:
            raise ValueError(
                f"No config schema '{config_schema}' found — run the OTL config-creation "
                "notebook for this connection first (Notebooks step)."
            )
        cursor.execute(
            f"SELECT Id, SourceSchemaName, SourceTableName, IsActive "
            f"FROM [{config_schema}].[OneTimeConfigETL] "
            f"ORDER BY SourceSchemaName, SourceTableName"
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r.Id,
                "schema_name": r.SourceSchemaName,
                "table_name": r.SourceTableName,
                # Stored as the string '1'/'0' by the notebook (see
                # 08.COLUMN SELECTION AND MODIFICATIONS cell) — normalize
                # to a real bool for the API response.
                "is_active": str(r.IsActive).strip() in ("1", "true", "True"),
            }
            for r in rows
        ]
    finally:
        conn.close()


def update_source_tables_active(
    client_id: str,
    client_secret: str,
    server: str,
    database: str,
    connection_name: str,
    active_ids: list[int],
) -> int:
    """Set IsActive='1' for exactly the given table Ids and IsActive='0'
    for every other table belonging to this connection. Returns the
    number of rows affected in total."""
    config_schema = f"Config_{connection_name}"
    conn = _connect_warehouse(client_id, client_secret, server, database)
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT COUNT(*) FROM sys.schemas WHERE name = ?", (config_schema,)
        )
        if cursor.fetchone()[0] != 1:
            raise ValueError(f"No config schema '{config_schema}' found for this connection.")

        table = f"[{config_schema}].[OneTimeConfigETL]"
        affected = 0

        if active_ids:
            placeholders = ",".join("?" for _ in active_ids)
            cursor.execute(
                f"UPDATE {table} SET IsActive = '1' WHERE Id IN ({placeholders}) AND IsActive <> '1'",
                active_ids,
            )
            affected += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
            cursor.execute(
                f"UPDATE {table} SET IsActive = '0' WHERE Id NOT IN ({placeholders}) AND IsActive <> '0'",
                active_ids,
            )
            affected += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        else:
            # Nothing selected at all — deactivate every table for this connection.
            cursor.execute(f"UPDATE {table} SET IsActive = '0' WHERE IsActive <> '0'")
            affected += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

        return affected
    finally:
        conn.close()