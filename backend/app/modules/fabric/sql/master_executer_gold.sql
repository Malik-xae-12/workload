/* ================================================================================
   Master Executor Deployment Script
   Target: WH_Gold  ->  Schema: [MasterExecuter]

   Creates:
     - Schema [MasterExecuter]
     - Table  [MasterExecuter].[ProcListStaging]  — scratch table for the
       list of active procedures for the current run (RowNum, SpName)
     - Table  [MasterExecuter].[ExecutionLog]     — per-SP run log, one row
       per (BatchId, SpName) attempt. This is what lets the backend show a
       live progress bar while [MasterExecuter].[sp_GoldExecute] runs,
       without the backend bypassing the procedure to do the looping
       itself — the procedure does all the work; the backend just watches
       this table.
     - Procedure [MasterExecuter].[sp_GoldExecute] @SilverLakehouse, @BatchId
       Reads the active stored procedure list from
       [WH_MetaData].[Config_Gold].[finin_gold_sp_details] (isActive = 1)
       and executes each one, passing @BatchId and/or @SilverLakehouse
       through *only if the target procedure actually declares them*,
       logging progress/result as it goes.

   ------------------------------------------------------------------------
   History of fixes in this version
   ------------------------------------------------------------------------

     1. sp_name in finin_gold_sp_details is schema-qualified, e.g.
        "ims.sp_Broker". The original version built the EXEC target as
        EXEC [ims.sp_Broker] — wrapping the *entire* dotted string in one
        bracket pair — resolved against the default schema, not [ims].
        First fix attempted PARSENAME() to split schema/name, but
        PARSENAME() isn't part of Fabric Data Warehouse's supported T-SQL
        surface and silently returned NULL for every row, which produced
        an even worse "ims.ims.sp_xxx" doubled name. Fixed here with plain
        CHARINDEX/SUBSTRING splitting on the first '.', which is reliable
        in Fabric DW.

     2. The original "try with @BatchId/@SilverLakehouse, on error 8145
        retry with no params" approach assumed every procedure in the
        script is a uniform ETL step with that exact signature (or none).
        In reality the ~85 procedures in combined_sp_deployment_ims.sql
        have wildly different signatures:
          - some take only @BatchId (no @SilverLakehouse)              -> "too many arguments specified" (error 8144), which the
                                                                            old code never caught, only 8145
          - some take unrelated *required* parameters with no default
            (@PortfolioCode, @Query, @ColumnName, ...) — these are
            internal helper procedures (sp_GetPositionData,
            sp_GetSecurityData, sp_GetSingleColumnFromQuery, ...), not
            top-level ETL entry points, and can never be called
            generically with just @BatchId/@SilverLakehouse.
        Fixed by inspecting sys.parameters for the actual target
        procedure at runtime and only passing @BatchId / @SilverLakehouse
        if the procedure declares them. As a safety net, if a procedure
        still has some *other* required parameter (no default), it's
        logged as 'Skipped' with a clear reason rather than crashing the
        whole batch — but every procedure in the current script now has
        full defaults (see below), so this should never actually trigger.

   ------------------------------------------------------------------------
   Additional fixes now applied directly in combined_sp_deployment_ims.sql
   so that every procedure can run unattended, none need to be skipped:
   ------------------------------------------------------------------------
     - "Invalid object name 'WH_MetaData.Log.GoldLogDetails'" — every
       procedure was inserting into a table called "GoldLogDetails", which
       never existed; the real audit table is [Log].[ETLBatchGoldLogDetails].
       All 207 of those INSERTs (across 84 procedures) have been renamed to
       point at the correct table, and rewritten to the table's actual
       column structure: BatchId, SchemaName, TableName, ProcessedRowCount,
       StartTime, EndTime, Status, ErrorMessage, SourceName. On top of the
       rename, the success-path inserts are now wrapped in their own
       BEGIN TRY/CATCH (matching the failure-path inserts' existing
       pattern), so a logging hiccup can never mask a successful ETL step.
     - "Invalid object name 'ims.Date'" — sp_RiskAnalytics_FindMissingDates
       referenced [ims].[Date], a copy/paste error; the Date dimension
       actually lives in dbo.[Date] (as used correctly by sp_Date and
       sp_DollarAnalytics_FindMissingDates). Fixed to dbo.[Date].
       sp_Date itself now also self-heals: it creates dbo.[Date] if it's
       missing (instead of throwing) and only inserts dates not already
       present, so re-running it for an overlapping date range is safe.
     - sp_GetPositionData / sp_GetSecurityData required @PortfolioCode
       with no default, and sp_GetSingleColumnFromQuery required
       @Query/@ColumnName with no default — these are on-demand
       data-access helpers, not ETL steps, but they now have safe
       defaults (NULL / a harmless "SELECT 1" placeholder) so the batch
       runner can execute them as a no-op instead of erroring on a
       missing required parameter. Real callers of these procs from the
       API still pass real arguments; the defaults only kick in when
       MasterExecuter calls them with none.
   ================================================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'MasterExecuter')
BEGIN
    EXEC('CREATE SCHEMA [MasterExecuter]');
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'MasterExecuter' AND t.name = 'ProcListStaging'
)
BEGIN
    CREATE TABLE [MasterExecuter].[ProcListStaging]
    (
        RowNum INT NOT NULL,
        SpName VARCHAR(255) NOT NULL
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'MasterExecuter' AND t.name = 'ExecutionLog'
)
BEGIN
    CREATE TABLE [MasterExecuter].[ExecutionLog]
    (
        Id           BIGINT IDENTITY NOT NULL,
        BatchId      INT           NOT NULL,
        SpName       VARCHAR(255)  NOT NULL,
        Status       VARCHAR(20)   NOT NULL,   -- Running | Success | Failed | Skipped
        ErrorMessage VARCHAR(4000) NULL,
        StartTime    DATETIME2(6)     NOT NULL,
        EndTime      DATETIME2(6)     NULL
    );
END
GO

CREATE OR ALTER PROCEDURE [MasterExecuter].[sp_GoldExecute]
(
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
)
AS
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
BEGIN
    SET NOCOUNT ON;

    IF @BatchId IS NULL
        SET @BatchId = DATEDIFF(SECOND, '2020-01-01', SYSUTCDATETIME());

    DECLARE @SpName        VARCHAR(255);
    DECLARE @Schema        VARCHAR(128);
    DECLARE @Proc          VARCHAR(255);
    DECLARE @Sql           NVARCHAR(MAX);
    DECLARE @StartTs       DATETIME2(6);
    DECLARE @ErrMsg        NVARCHAR(4000);
    DECLARE @DotPos        INT;
    DECLARE @ObjectId      INT;
    DECLARE @HasBatchId    BIT;
    DECLARE @HasSilverLh   BIT;
    DECLARE @OtherRequired NVARCHAR(1000);

    DELETE FROM [MasterExecuter].[ProcListStaging];

    INSERT INTO [MasterExecuter].[ProcListStaging] (RowNum, SpName)
    SELECT ROW_NUMBER() OVER (ORDER BY sp_name), sp_name
    FROM [WH_MetaData].[Config_Gold].[finin_gold_sp_details]
    WHERE isActive = 1;

    DECLARE @CurrentRow INT = 1;
    DECLARE @TotalRows INT;

    SELECT @TotalRows = COUNT(*)
    FROM [MasterExecuter].[ProcListStaging];

    WHILE @CurrentRow <= @TotalRows
    BEGIN
        SELECT @SpName = SpName
        FROM [MasterExecuter].[ProcListStaging]
        WHERE RowNum = @CurrentRow;

        -- sp_name is schema-qualified ("ims.sp_Broker") — split it on the
        -- first '.' with CHARINDEX/SUBSTRING rather than PARSENAME().
        -- PARSENAME() is not part of Fabric Data Warehouse's supported
        -- T-SQL surface and was silently returning NULL for every row,
        -- which produced doubled-schema "ims.ims.sp_xxx" lookups.
        SET @DotPos = CHARINDEX('.', @SpName);
        IF @DotPos > 0
        BEGIN
            SET @Schema = LEFT(@SpName, @DotPos - 1);
            SET @Proc   = SUBSTRING(@SpName, @DotPos + 1, LEN(@SpName));
        END
        ELSE
        BEGIN
            SET @Schema = 'ims';
            SET @Proc   = @SpName;
        END

        SET @StartTs = SYSUTCDATETIME();

        INSERT INTO [MasterExecuter].[ExecutionLog]
        (
            BatchId,
            SpName,
            Status,
            StartTime
        )
        VALUES
        (
            @BatchId,
            @SpName,
            'Running',
            @StartTs
        );

        SET @ErrMsg = NULL;

        SET @ObjectId = OBJECT_ID(QUOTENAME(@Schema) + '.' + QUOTENAME(@Proc), 'P');

        IF @ObjectId IS NULL
        BEGIN
            UPDATE [MasterExecuter].[ExecutionLog]
            SET
                Status = 'Failed',
                ErrorMessage = 'Stored procedure ' + @Schema + '.' + @Proc + ' does not exist — stale entry in Config_Gold.finin_gold_sp_details (was the deployment script re-run after this row was added?).',
                EndTime = SYSUTCDATETIME()
            WHERE BatchId = @BatchId
              AND SpName = @SpName
              AND StartTime = @StartTs;

            SET @CurrentRow = @CurrentRow + 1;
            CONTINUE;
        END

        -- Inspect the *actual* signature of this procedure instead of
        -- guessing/retrying — avoids "too many arguments" (a param we
        -- passed that the proc doesn't have) and avoids blindly calling
        -- procedures that need real inputs we don't have.
        SELECT @HasBatchId  = MAX(CASE WHEN p.name = '@BatchId'         THEN 1 ELSE 0 END),
               @HasSilverLh = MAX(CASE WHEN p.name = '@SilverLakehouse' THEN 1 ELSE 0 END)
        FROM sys.parameters p
        WHERE p.object_id = @ObjectId;

        SELECT @OtherRequired = STRING_AGG(p.name, ', ')
        FROM sys.parameters p
        WHERE p.object_id = @ObjectId
          AND p.has_default_value = 0
          AND p.is_output = 0
          AND p.name NOT IN ('@BatchId', '@SilverLakehouse');

        IF @OtherRequired IS NOT NULL
        BEGIN
            UPDATE [MasterExecuter].[ExecutionLog]
            SET
                Status = 'Skipped',
                ErrorMessage = 'Requires parameter(s) with no default that MasterExecuter cannot supply: ' + @OtherRequired + '. Give it a default value in the CREATE PROCEDURE definition if it should run automatically.',
                EndTime = SYSUTCDATETIME()
            WHERE BatchId = @BatchId
              AND SpName = @SpName
              AND StartTime = @StartTs;

            SET @CurrentRow = @CurrentRow + 1;
            CONTINUE;
        END

        BEGIN TRY

            IF @HasBatchId = 1 AND @HasSilverLh = 1
            BEGIN
                SET @Sql = N'EXEC ' + QUOTENAME(@Schema) + N'.' + QUOTENAME(@Proc) +
                           N' @BatchId=@P_BatchId, @SilverLakehouse=@P_SilverLakehouse;';
                EXEC sp_executesql
                    @Sql,
                    N'@P_BatchId INT, @P_SilverLakehouse VARCHAR(MAX)',
                    @P_BatchId = @BatchId,
                    @P_SilverLakehouse = @SilverLakehouse;
            END
            ELSE IF @HasBatchId = 1
            BEGIN
                SET @Sql = N'EXEC ' + QUOTENAME(@Schema) + N'.' + QUOTENAME(@Proc) +
                           N' @BatchId=@P_BatchId;';
                EXEC sp_executesql @Sql, N'@P_BatchId INT', @P_BatchId = @BatchId;
            END
            ELSE IF @HasSilverLh = 1
            BEGIN
                SET @Sql = N'EXEC ' + QUOTENAME(@Schema) + N'.' + QUOTENAME(@Proc) +
                           N' @SilverLakehouse=@P_SilverLakehouse;';
                EXEC sp_executesql @Sql, N'@P_SilverLakehouse VARCHAR(MAX)', @P_SilverLakehouse = @SilverLakehouse;
            END
            ELSE
            BEGIN
                SET @Sql = N'EXEC ' + QUOTENAME(@Schema) + N'.' + QUOTENAME(@Proc) + N';';
                EXEC sp_executesql @Sql;
            END

            UPDATE [MasterExecuter].[ExecutionLog]
            SET
                Status = 'Success',
                EndTime = SYSUTCDATETIME()
            WHERE BatchId = @BatchId
              AND SpName = @SpName
              AND StartTime = @StartTs;

        END TRY
        BEGIN CATCH

            SET @ErrMsg = ERROR_MESSAGE();

            -- A genuine failure inside the procedure — the signature was
            -- called correctly, something in the proc body itself (a
            -- missing table, a logic bug, permissions, etc.) failed.
            UPDATE [MasterExecuter].[ExecutionLog]
            SET
                Status = 'Failed',
                ErrorMessage = LEFT(@ErrMsg, 4000),
                EndTime = SYSUTCDATETIME()
            WHERE BatchId = @BatchId
              AND SpName = @SpName
              AND StartTime = @StartTs;

        END CATCH;

        SET @CurrentRow = @CurrentRow + 1;
    END;

    SELECT
        @BatchId AS BatchId,
        COUNT(*) AS TotalExecuted,
        SUM(CASE WHEN Status = 'Success' THEN 1 ELSE 0 END) AS Succeeded,
        SUM(CASE WHEN Status = 'Failed'  THEN 1 ELSE 0 END) AS Failed,
        SUM(CASE WHEN Status = 'Skipped' THEN 1 ELSE 0 END) AS Skipped
    FROM [MasterExecuter].[ExecutionLog]
    WHERE BatchId = @BatchId;
END;
GO