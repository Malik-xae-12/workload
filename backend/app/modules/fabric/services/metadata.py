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