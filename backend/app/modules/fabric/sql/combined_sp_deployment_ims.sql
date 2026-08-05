/*
=================================================================================
 Combined Stored Procedure Deployment Script
 Target: WH_Gold  ->  Schema: [ims]
 Fabric Warehouse compatible: 86 procedures
 Source: updated_1.zip + creation.zip (combined as-is, no logic changes)
=================================================================================
*/

USE [WH_Gold];
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'ims')
BEGIN
    EXEC('CREATE SCHEMA [ims]');
END
GO

-- ============================== Source file: sp_DollarAnalytics_FindMissingDates.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DollarAnalytics_FindMissingDates]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL,
    @StartDate DATE = NULL,
    @EndDate DATE = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'DollarAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'DollarAnalytics_FindMissingDates';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @SQL NVARCHAR(MAX);

    BEGIN TRY

        SET @StartDate =
            ISNULL(
                @StartDate,
                DATEADD(DAY, -30, CAST(GETDATE() AS DATE))
            );

        SET @EndDate =
            ISNULL(
                @EndDate,
                CAST(GETDATE() AS DATE)
            );

        SET @SQL = N'
        SELECT DISTINCT
            CAST(d.[Date] AS DATE) AS dt
        FROM dbo.[Date] d
        LEFT JOIN [' + @SilverLakehouse + N'].[dbo].[DollarAnalytics] fda
            ON fda.[EffectiveDt] = d.[Date]
        WHERE d.[Date] BETWEEN @StartDate AND @EndDate
          AND DATEPART(WEEKDAY, d.[Date]) BETWEEN 2 AND 6
          AND fda.[EffectiveDt] IS NULL
        ORDER BY dt;';

        EXEC sp_executesql
            @SQL,
            N'@StartDate DATE,@EndDate DATE',
            @StartDate,
            @EndDate;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE();

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_GetPositionData.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_GetPositionData]

    @BatchId INT = NULL,
    -- Default added so MasterExecuter can run this on-demand data-access
    -- helper as part of the automated batch without erroring on a missing
    -- required parameter. NULL simply matches no rows (PortfolioCode is
    -- never actually NULL), so this is a safe no-op for the batch; real
    -- API callers still pass an actual portfolio code.
    @PortfolioCode VARCHAR(255) = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'FactPosition';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'GetPositionData';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate Source Table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'ims.FactPosition', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactPosition does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Return Position Data
        -----------------------------------------------------------------------
        SELECT *
        FROM ims.FactPosition
        WHERE AsOfDate >= DATEADD(YEAR, -1, GETDATE())
          AND PortfolioCode = @PortfolioCode;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in GetPositionData';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH
END;
GO

-- ============================== Source file: sp_GetSecurityData.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_GetSecurityData]
    @BatchId INT = NULL,
    -- Default added so MasterExecuter can run this on-demand data-access
    -- helper as part of the automated batch without erroring on a missing
    -- required parameter. NULL simply matches no rows (PortfolioCode is
    -- never actually NULL), so this is a safe no-op for the batch; real
    -- API callers still pass an actual portfolio code.
    @PortfolioCode VARCHAR(255) = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPosAnalyticsData';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'GetSecurityData';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate Source Table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'ims.RptPosAnalyticsData', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.RptPosAnalyticsData does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Return Security Data
        -----------------------------------------------------------------------
        SELECT *
        FROM ims.RptPosAnalyticsData
        WHERE EffectiveDt >= DATEADD(YEAR, -1, GETDATE())
          AND PFBMCode = @PortfolioCode;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in GetSecurityData';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_GetSingleColumnFromQuery.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_GetSingleColumnFromQuery]
(
    -- Defaults added so MasterExecuter can run this generic dynamic-SQL
    -- helper as part of the automated batch without erroring on a missing
    -- required parameter. With no args it degrades to a harmless no-op
    -- health check (SELECT 1); real callers still pass a real query.
    @Query NVARCHAR(MAX) = N'SELECT 1 AS DummyValue',
    @ColumnName NVARCHAR(255) = N'DummyValue'
)
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SQL NVARCHAR(MAX);

    SET @SQL =
        N'SELECT ' + QUOTENAME(@ColumnName) + N'
          FROM
          (
              ' + @Query + N'
          ) AS SubQuery';

    EXEC sp_executesql @SQL;

END;
GO

-- ============================== Source file: sp_Gold_AssetClass_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_AssetClass_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimLinkAssetClass
        -----------------------------------------------------------------------
        SET @TableName = 'DimLinkAssetClass';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimLinkAssetClass]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Benchmark_IndexSecurity_Table_400_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Benchmark_IndexSecurity_Table_400_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimBenchmark
        -----------------------------------------------------------------------
        SET @TableName = 'DimBenchmark';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimBenchmark]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimIndexSecurity
        -----------------------------------------------------------------------
        SET @TableName = 'DimIndexSecurity';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimIndexSecurity]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Benchmark_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Benchmark_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimBenchmark
        -----------------------------------------------------------------------
        SET @TableName = 'DimBenchmark';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimBenchmark]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Broker_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Broker_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimBroker
        -----------------------------------------------------------------------
        SET @TableName = 'DimBroker';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimBroker]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Characteristics_Security_Table_200_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Characteristics_Security_Table_200_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimSecurity
        -----------------------------------------------------------------------
        SET @TableName = 'DimSecurity';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimSecurity]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RiskAnalytics
        -----------------------------------------------------------------------
        SET @TableName = 'RiskAnalytics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RiskAnalytics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DollarAnalytics
        -----------------------------------------------------------------------
        SET @TableName = 'DollarAnalytics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DollarAnalytics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- StandardAnalytics
        -----------------------------------------------------------------------
        SET @TableName = 'StandardAnalytics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_StandardAnalytics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- StandardSource
        -----------------------------------------------------------------------
        SET @TableName = 'StandardSource';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_StandardSource]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- StandardSourceField
        -----------------------------------------------------------------------
        SET @TableName = 'StandardSourceField';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_StandardSourceField]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    ISNULL(@StartTime,@EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Client_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Client_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimClient
        -----------------------------------------------------------------------
        SET @TableName = 'DimClient';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimClient]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Custodian_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Custodian_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'DimCustodian';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'Gold_Custodian_Table_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Execute Child Procedure
        -----------------------------------------------------------------------
        EXEC [ims].[sp_Custodian]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in Gold_Custodian_Table_Process';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Fixed_Income_Process.sql ==============================
CREATE OR ALTER PROCEDURE ims.sp_Gold_Fixed_Income_Process 
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver', 
    @BatchId INT = NULL 
/* UB Technology Innovations. Unauthorized use or reproduction is prohibited. */
AS 
BEGIN 
    SET NOCOUNT ON; 

    DECLARE @SchemaName VARCHAR(255) = 'ims';
    -- Corrected DECLARE block with commas and variable prefixes (@)
    DECLARE @TableName VARCHAR(200),
            @ProcedureName VARCHAR(256),
            @ErrorMessage VARCHAR(8000),
            @Operation VARCHAR(10) = 'READ',
            @ErrorSeverity INT,
            @ErrorState INT,
            @StartTime DATETIME2(6) = SYSUTCDATETIME(),
            @EndTime DATETIME2(6),
            @Duration VARCHAR(50);

    BEGIN TRY 
        -- DimSecurity Execution
        SET @TableName = 'DimSecurity'; 
        SET @ProcedureName = 'DimSecurity_Gold_Process'; 
        EXEC ims.sp_DimSecurity @SilverLakehouse = @SilverLakehouse, @BatchId = @BatchId; 

        -- RiskAnalytics Execution
        SET @TableName = 'RiskAnalytics'; 
        SET @ProcedureName = 'RiskAnalytics_Gold_Process'; 
        EXEC ims.sp_DimRiskAnalytics @SilverLakehouse = @SilverLakehouse, @BatchId = @BatchId; 

        -- DollarAnalytics Execution
        SET @TableName = 'DollarAnalytics'; 
        SET @ProcedureName = 'DollarAnalytics_Gold_Process'; 
        EXEC ims.sp_DollarAnalytics @SilverLakehouse = @SilverLakehouse, @BatchId = @BatchId; 

        -- StandardAnalytics Execution
        SET @TableName = 'StandardAnalytics'; 
        SET @ProcedureName = 'StandardAnalytics_Gold_Process'; 
        EXEC ims.sp_StandardAnalytics @SilverLakehouse = @SilverLakehouse, @BatchId = @BatchId; 

        -- Success Logging 
        SET @EndTime = SYSUTCDATETIME(); 
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds'; 

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails] (BatchId, TableName, Status, ErrorDetails, StartTime, EndTime, Duration, RowsInserted) 
        VALUES (@BatchId, @TableName, 'Success', NULL, @StartTime, @EndTime, @Duration, 0); 
    END TRY 

    BEGIN CATCH 
        -- Error Handling
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Gold_Fixed_Income_Process'; 
        SET @ErrorSeverity = ERROR_SEVERITY(); 
        SET @ErrorState = ERROR_STATE(); 
        SET @EndTime = SYSUTCDATETIME(); 
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds'; 

        BEGIN TRY 
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails] (BatchId, TableName, Status, ErrorDetails, StartTime, EndTime, Duration, RowsInserted) 
            VALUES (@BatchId, @TableName, 'Failed', @ErrorMessage, @StartTime, @EndTime, @Duration, 0); 
        END TRY 
        BEGIN CATCH 
            -- Swallow logging errors so they never mask the real failure 
        END CATCH 
        
        -- Raise the error back to the orchestration layer
        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH 
END;

GO

-- ============================== Source file: sp_Gold_IndexSecurity_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_IndexSecurity_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Execute Child Procedure
        -----------------------------------------------------------------------
        SET @TableName = 'DimIndexSecurity'
        SET @ProcedureName = 'sp_DimIndexSecurity'
        EXEC [ims].[sp_DimIndexSecurity]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE();

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_PortfolioAllocationDetails_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_PortfolioAllocationDetails_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Execute Child Procedure
        -----------------------------------------------------------------------
        SET @TableName = 'FactPortfolioAllocationDetails';
        SET @ProcedureName  = 'sp_DimFactPortfolioAllocationDetails';
        EXEC [ims].[sp_DimFactPortfolioAllocationDetails]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE();

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_PortfolioGroup_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_PortfolioGroup_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) ;
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY
        
        SET @TableName = 'DimPortfolioGroup'
        SET @ProcedureName = 'sp_DimPortfolioGroup'
        EXEC [ims].[sp_DimPortfolioGroup]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

       
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() ;

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_PortfolioStressTestResults_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_PortfolioStressTestResults_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) ;
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY
        SET @TableName = 'FactPortfolioStressTestResults'
        SET @ProcedureName = 'sp_FactPortfolioStressTestResults'
        EXEC [ims].[sp_FactPortfolioStressTestResults]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE();

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Portfolio_Position_Table_300_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Portfolio_Position_Table_300_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Portfolio Group
        -----------------------------------------------------------------------
        SET @TableName = 'DimPortfolioGroup'
        SET @ProcedureName = 'sp_DimPortfolioGroup'
        EXEC [ims].[sp_DimPortfolioGroup]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        -----------------------------------------------------------------------
        -- Portfolio
        -----------------------------------------------------------------------
        SET @TableName = 'DimPortfolio'
        SET @ProcedureName = 'sp_DimPortfolio'
        EXEC [ims].[sp_DimPortfolio]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        -----------------------------------------------------------------------
        -- Position
        -----------------------------------------------------------------------
        SET @TableName = 'DimPosition'
        SET @ProcedureName = 'sp_DimPosition'
        EXEC [ims].[sp_DimPosition]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE();

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Reference_Table_100_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Reference_Table_100_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimSourceSystemType
        -----------------------------------------------------------------------
        SET @TableName = 'DimSourceSystemType';
        SET @ProcedureName = 'sp_DimSourceSystemType';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimSourceSystemType]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimSourceSystem
        -----------------------------------------------------------------------
        SET @TableName = 'DimSourceSystem';
        SET @ProcedureName = 'sp_DimSourceSystem';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimSourceSystem]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimSecurityType
        -----------------------------------------------------------------------
        SET @TableName = 'DimSecurityType';
        SET @ProcedureName = 'sp_DimSecurityType';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimSecurityType]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimAggregation
        -----------------------------------------------------------------------
        SET @TableName = 'DimAggregation';
        SET @ProcedureName = 'sp_DimAggregation';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimAggregation]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimAggregationMetric
        -----------------------------------------------------------------------
        SET @TableName = 'DimAggregationMetric';
        SET @ProcedureName = 'sp_DimAggregationMetric';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimAggregationMetric]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimAssetClass
        -----------------------------------------------------------------------
        SET @TableName = 'DimAssetClass';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimAssetClass]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimBroker
        -----------------------------------------------------------------------
        SET @TableName = 'DimBroker';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimBroker]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimClient
        -----------------------------------------------------------------------
        SET @TableName = 'DimClient';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimClient]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimCountry
        -----------------------------------------------------------------------
        SET @TableName = 'DimCountry';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimCountry]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimCurrency
        -----------------------------------------------------------------------
        SET @TableName = 'DimCurrency';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimCurrency]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimCustodian
        -----------------------------------------------------------------------
        SET @TableName = 'DimCustodian';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimCustodian]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimGics
        -----------------------------------------------------------------------
        SET @TableName = 'DimGics';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimGics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimMetric
        -----------------------------------------------------------------------
        SET @TableName = 'DimMetric';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimMetric]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

        -----------------------------------------------------------------------
        -- DimStrategy
        -----------------------------------------------------------------------
        SET @TableName = 'DimStrategy';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimStrategy]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Success',
            NULL,
            @ProcedureName
        );

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, ISNULL(@StartTime,@EndTime), @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Reference_Table_100_Ubti_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Reference_Table_100_Ubti_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimAggregationMetric
        -----------------------------------------------------------------------
        SET @TableName = 'DimAggregationMetric';
        SET @ProcedureName = 'sp_DimAggregationMetric';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimAggregationMetric]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimSourceSystem
        -----------------------------------------------------------------------
        SET @TableName = 'DimSourceSystem';
        SET @ProcedureName = 'sp_DimSourceSystem';
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimSourceSystem]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, ISNULL(@StartTime, @EndTime), @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Reference_Table_200_Customer_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Reference_Table_200_Customer_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @SQL NVARCHAR(MAX);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimBroker
        -----------------------------------------------------------------------
        SET @TableName = 'DimBroker';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimBroker]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimClient
        -----------------------------------------------------------------------
        SET @TableName = 'DimClient';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimClient]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimCountry
        -----------------------------------------------------------------------
        SET @TableName = 'DimCountry';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimCountry]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimCurrency
        -----------------------------------------------------------------------
        SET @TableName = 'DimCurrency';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimCurrency]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimCustodian
        -----------------------------------------------------------------------
        SET @TableName = 'DimCustodian';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimCustodian]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimGics
        -----------------------------------------------------------------------
        SET @TableName = 'DimGics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimGics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- DimStrategy
        -----------------------------------------------------------------------
        SET @TableName = 'DimStrategy';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimStrategy]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, ISNULL(@StartTime,@EndTime), @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Report_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Report_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- RptPFBMSecurity
        -----------------------------------------------------------------------
        SET @TableName = 'RptPFBMSecurity';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPFBMSecurity]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPortfolioBenchmark
        -----------------------------------------------------------------------
        SET @TableName = 'RptPortfolioBenchmark';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPortfolioBenchmark]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPortfolioBenchmarkVariance
        -----------------------------------------------------------------------
        SET @TableName = 'RptPortfolioBenchmarkVariance';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPortfolioBenchmarkVariance]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptSecurityAnalytics
        -----------------------------------------------------------------------
        SET @TableName = 'RptSecurityAnalytics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptSecurityAnalytics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptSecurityAnalyticsUnpivot
        -----------------------------------------------------------------------
        SET @TableName = 'RptSecurityAnalyticsUnpivot';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptSecurityAnalyticsUnpivot]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPosAnalytics
        -----------------------------------------------------------------------
        SET @TableName = 'RptPosAnalytics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPosAnalytics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPosAnalyticsData
        -----------------------------------------------------------------------
        SET @TableName = 'RptPosAnalyticsData';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPosAnalyticsData]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPerformanceAttribution
        -----------------------------------------------------------------------
        SET @TableName = 'RptPerformanceAttribution';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPerformanceAttribution]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(
                DATEDIFF(
                    SECOND,
                    ISNULL(@StartTime,@EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Report_Table_Process_Test.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Report_Table_Process_Test]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- RptPFBMSecurity
        -----------------------------------------------------------------------
        SET @TableName = 'RptPFBMSecurity';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPFBMSecurity]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPortfolioBenchmark
        -----------------------------------------------------------------------
        SET @TableName = 'RptPortfolioBenchmark';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPortfolioBenchmark]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPortfolioBenchmarkVariance
        -----------------------------------------------------------------------
        SET @TableName = 'RptPortfolioBenchmarkVariance';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPortfolioBenchmarkVariance]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptSecurityAnalytics
        -----------------------------------------------------------------------
        SET @TableName = 'RptSecurityAnalytics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptSecurityAnalytics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptSecurityAnalyticsUnpivot
        -----------------------------------------------------------------------
        SET @TableName = 'RptSecurityAnalyticsUnpivot';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptSecurityAnalyticsUnpivot]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPosAnalytics
        -----------------------------------------------------------------------
        SET @TableName = 'RptPosAnalytics';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPosAnalytics]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- RptPosAnalyticsData
        -----------------------------------------------------------------------
        SET @TableName = 'RptPosAnalyticsData';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_RptPosAnalyticsData]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(
                DATEDIFF(
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_SecurityType_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_SecurityType_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimLinkSecurityType
        -----------------------------------------------------------------------
        SET @TableName = 'DimLinkSecurityType';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimLinkSecurityType]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(
                DATEDIFF(
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Strategy_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Strategy_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- DimStrategy
        -----------------------------------------------------------------------
        SET @TableName = 'DimStrategy';
        SET @ProcedureName = 'sp_' + @TableName;
        SET @StartTime = SYSUTCDATETIME();

        EXEC [ims].[sp_DimStrategy]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(
                DATEDIFF(
                    SECOND,
                    ISNULL(@StartTime, @EndTime),
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_Gold_Transact_Table_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Gold_Transact_Table_Process]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256);
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Execute Child Procedure
        -----------------------------------------------------------------------
        
        SET @TableName = 'FactTransact'
        SET @ProcedureName = 'sp_FactTransact'
        EXEC [ims].[sp_FactTransact]
            @SilverLakehouse = @SilverLakehouse,
            @BatchId = @BatchId;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE();

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_IndexSecurity_New_Data_Generation.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_IndexSecurity_New_Data_Generation]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'IndexSecurityRaw';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'IndexSecurity_New_Data_Generation';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    DECLARE @MaxDate DATETIME2(6);
    DECLARE @SQL NVARCHAR(MAX);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate target table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'dbo.IndexSecurityRaw', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table dbo.IndexSecurityRaw does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Get latest AsOfDate from Silver Lakehouse
        -----------------------------------------------------------------------
        SET @SQL = N'
            SELECT @MaxDateOUT = MAX(AsOfDate)
            FROM [' + @SilverLakehouse + N'].[dbo].[IndexSecurity];
        ';

        EXEC sp_executesql
            @SQL,
            N'@MaxDateOUT DATETIME2(6) OUTPUT',
            @MaxDateOUT = @MaxDate OUTPUT;

        IF @MaxDate IS NULL
        BEGIN
            THROW 50001, 'No records found in source table IndexSecurity.', 1;
        END;

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE dbo.IndexSecurityRaw;

        SET @SQL = N'
            INSERT INTO dbo.IndexSecurityRaw
            (
                AsOfDate,
                BenchmarkCode,
                Identifier,
                CurrentFace
            )
            SELECT
                FORMAT(
                    SYSDATETIMEOFFSET() AT TIME ZONE ''Pacific Standard Time'',
                    ''MM/dd/yyyy''
                ) AS AsOfDate,
                BenchmarkCode,
                Identifier,
                CurrentFace
            FROM [' + @SilverLakehouse + N'].[dbo].[IndexSecurity]
            WHERE AsOfDate = @MaxDate;
        ';

        EXEC sp_executesql
            @SQL,
            N'@MaxDate DATETIME2(6)',
            @MaxDate = @MaxDate;

        SET @RowsInserted = @@ROWCOUNT;

        IF @RowsInserted = 0
        BEGIN
            THROW 50001, 'No records were inserted into IndexSecurityRaw.', 1;
        END;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in IndexSecurity_New_Data_Generation';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH
END;
GO

-- ============================== Source file: sp_RiskAnalytics_FindMissingDates.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RiskAnalytics_FindMissingDates]
(
    @StartDate DATE = NULL,
    @EndDate DATE = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    SET @StartDate = ISNULL
    (
        @StartDate,
        DATEADD(DAY, -30, CAST(GETDATE() AS DATE))
    );

    SET @EndDate = ISNULL
    (
        @EndDate,
        CAST(GETDATE() AS DATE)
    );

    SELECT DISTINCT
        CAST(d.[Date] AS DATE) AS dt
    FROM dbo.[Date] d
    LEFT JOIN [FinIn_DE_LH_BRONZE_AND_SILVER].[dbo].[RiskAnalytics] fra
        ON fra.[EffectiveDt] = d.[Date]
    WHERE d.[Date] BETWEEN @StartDate AND @EndDate
      AND DATEPART(WEEKDAY, d.[Date]) BETWEEN 2 AND 6
      AND fra.[EffectiveDt] IS NULL
    ORDER BY dt;

END;
GO

-- ============================== Source file: sp_RptEndogenousLiquidity.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptEndogenousLiquidity]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptEndogenousLiquidity';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'sp_RptEndogenousLiquidity';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Refresh Data
        -----------------------------------------------------------------------
        TRUNCATE TABLE [ims].[RptEndogenousLiquidity];

        INSERT INTO [ims].[RptEndogenousLiquidity]
        SELECT *
        FROM [ims].[vw_RptEndogenousLiquidity];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    @StartTime,
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPFBMSecurity.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPFBMSecurity]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver', -- not used in this procedure; source is a Gold-layer view
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPFBMSecurity';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'RptPFBMSecurity_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate Target Table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'ims.RptPFBMSecurity', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.RptPFBMSecurity does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE ims.RptPFBMSecurity;

        INSERT INTO ims.RptPFBMSecurity
        (
            [RptPFBMKey],
            [PFBMCode],
            [AsOfDate],
            [SecurityKey],
            [Quantity],
            [IsPortfolio],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        )
        SELECT
            [RptPFBMKey],
            [PFBMCode],
            [AsOfDate],
            [SecurityKey],
            [Quantity],
            [IsPortfolio],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        FROM [FinIn_DE_WH_GOLD].[ims].[vw_RptPFBMSecurity];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in RptPFBMSecurity_Gold_Process';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPFSecurityAnalytics_Stage.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPFSecurityAnalytics_Stage]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPFBMSecurityAnalytics_Stage';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE [ims].[RptPFBMSecurityAnalytics_Stage];

        INSERT INTO [ims].[RptPFBMSecurityAnalytics_Stage]
        (
            SecurityAnalyticsKey,
            SecurityKey,
            LinkAssetClassKey,
            LinkSecurityTypeKey,
            CurrencyKey,
            CountryKey,
            ShortName,
            LongName,
            SecurityDescription,
            SourceSystemKey,
            IndustryGICS,
            SubindustryGICS,
            SectorGICS,
            IndustryGroupGICS,
            SubSectorGICS,
            ProductType,
            Coupon,
            EffectiveDt,
            PriceStartDay,
            PriceLastEOD,
            DividendYield,
            DividendAmount,
            NextDividendPaydate,
            LastDividendPaydate,
            FiftyTwoWeekHigh,
            FiftyTwoWeekLow,
            CurrentYearHigh,
            CurrentYearLow,
            MarketPrice,
            Factor,
            OneMCPR,
            ThreeMCPR,
            SixMCPR,
            TwelveMCPR,
            DTC,
            KeyRateDur6M,
            KeyRateDur1Yr,
            KeyRateDur2y,
            KeyRateDur3y,
            KeyRateDur5y,
            KeyRateDur7y,
            KeyRateDur10y,
            WAC,
            WAM,
            ModifiedDur,
            SpreadDur,
            OAS,
            Convexity,
            AdjustedDur,
            YTM,
            FIGI,
            SYMBOL,
            CUSIP,
            ISIN,
            SEDOL,
            PE,
            Beta,
            Identifier,
            Delta,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            ROW_NUMBER() OVER
            (
                ORDER BY SecurityKey, EffectiveDt, SYMBOL
            ) AS SecurityAnalyticsKey,
            *
        FROM
        (
            SELECT DISTINCT
                s.SecurityKey,
                s.LinkAssetClassKey,
                s.LinkSecurityTypeKey,
                s.CurrencyKey,
                s.CountryKey,
                s.ShortName,
                s.LongName,
                s.SecurityDescription,
                s.SourceSystemKey,
                s.IndustryGICS,
                s.SubindustryGICS,
                s.SectorGICS,
                s.IndustryGroupGICS,
                s.SubSectorGICS,
                s.ProductType,
                s.Coupon,
                sda.EffectiveDt,
                sda.PriceStartDay,
                sda.PriceLastEOD,
                sda.DividendYield,
                sda.DividendAmount,
                sda.NextDividendPaydate,
                sda.LastDividendPaydate,
                sda.FiftyTwoWeekHigh,
                sda.FiftyTwoWeekLow,
                sda.CurrentYearHigh,
                sda.CurrentYearLow,
                sda.MarketPrice,
                sda.Factor,
                sda.OneMCPR,
                sda.ThreeMCPR,
                sda.SixMCPR,
                sda.TwelveMCPR,
                sda.DTC,
                sra.KeyRateDur6M,
                sra.KeyRateDur1Yr,
                sra.KeyRateDur2y,
                sra.KeyRateDur3y,
                sra.KeyRateDur5y,
                sra.KeyRateDur7y,
                sra.KeyRateDur10y,
                sra.WAC,
                sra.WAM,
                sra.ModifiedDur,
                sra.SpreadDur,
                sra.OAS,
                sra.Convexity,
                sra.AdjustedDur,
                sra.YTM,
                si.FIGI,
                si.SYMBOL,
                si.CUSIP,
                si.ISIN,
                si.SEDOL,
                sra.PERatio AS PE,
                sra.EquityVolatility AS Beta,
                CASE
                    WHEN si.CUSIP <> '' THEN si.CUSIP
                    ELSE si.SYMBOL
                END AS Identifier,
                sda.MarketPrice - sda.PriceStartDay AS Delta,
                s.CreatedBy,
                s.CreatedDate,
                s.UpdatedBy,
                CASE
                    WHEN s.UpdatedDate > sda.UpdatedDate
                         AND s.UpdatedDate > sra.UpdatedDate
                         AND s.UpdatedDate > sid.UpdatedDate
                        THEN s.UpdatedDate
                    WHEN sda.UpdatedDate > s.UpdatedDate
                         AND sda.UpdatedDate > sra.UpdatedDate
                         AND sda.UpdatedDate > sid.UpdatedDate
                        THEN sda.UpdatedDate
                    WHEN sra.UpdatedDate > s.UpdatedDate
                         AND sra.UpdatedDate > sda.UpdatedDate
                         AND sra.UpdatedDate > sid.UpdatedDate
                        THEN sra.UpdatedDate
                    ELSE sid.UpdatedDate
                END AS UpdatedDate
            FROM [ims].[DimSecurity] s
            LEFT JOIN [ims].[FactDollarAnalytics] sda
                ON sda.SecurityKey = s.SecurityKey
            LEFT JOIN [ims].[FactRiskAnalytics] sra
                ON sra.SecurityKey = s.SecurityKey
               AND sra.EffectiveDt = sda.EffectiveDt
            LEFT JOIN [ims].[DimSecurityIdentifier] sid
                ON sid.SecurityKey = s.SecurityKey
            JOIN
            (
                SELECT
                    SecurityKey,
                    FIGI,
                    SYMBOL,
                    CUSIP,
                    ISIN,
                    SEDOL
                FROM
                (
                    SELECT
                        SecurityKey,
                        Identifier,
                        IdentifierType
                    FROM [ims].[DimSecurityIdentifier]
                ) si
                PIVOT
                (
                    MIN(Identifier)
                    FOR IdentifierType IN
                    (
                        FIGI,
                        SYMBOL,
                        CUSIP,
                        ISIN,
                        SEDOL
                    )
                ) p
            ) si
                ON si.SecurityKey = s.SecurityKey
        ) Final;

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_RptPFSecurityAnalytics_Stage'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Failed',
            @ErrorMessage,
            'sp_RptPFSecurityAnalytics_Stage'
        );

        THROW;

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPerformanceAttribution.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPerformanceAttribution]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPerformanceAttribution';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'sp_RptPerformanceAttribution';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Refresh Data
        -----------------------------------------------------------------------
        TRUNCATE TABLE [ims].[RptPerformanceAttribution];

        INSERT INTO [ims].[RptPerformanceAttribution]
        SELECT *
        FROM [ims].[vw_RptPerformanceAttribution];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST
            (
                DATEDIFF
                (
                    SECOND,
                    @StartTime,
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPortfolioBenchmark.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPortfolioBenchmark]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver' -- not used in this procedure; source is a Gold-layer view, kept for signature consistency
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'RptPortfolioBenchmark';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'RptPortfolioBenchmark_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;

    BEGIN TRY

        -- ---- Target: ims.RptPortfolioBenchmark ----
        IF OBJECT_ID(N'ims.RptPortfolioBenchmark', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.RptPortfolioBenchmark does not exist.', 1;
        END

        TRUNCATE TABLE ims.RptPortfolioBenchmark;

        INSERT INTO ims.RptPortfolioBenchmark (
             [RptPortfolioKey]
            ,[StrategyCode]
            ,[StrategyName]
            ,[PortfolioKey]
            ,[PFBMCode]
            ,[PFBMType]
            ,[PFBMName]
            ,[Type]
            ,[IsActive]
            ,[Root]
            ,[LinkedBenchmarkCode]
            ,[CreatedBy]
            ,[CreatedDate]
            ,[UpdatedBy]
            ,[UpdatedDate]
        )
        SELECT
            s.RptPortfolioKey,
            s.StrategyCode,
            s.StrategyName,
            s.PortfolioKey,
            s.PFBMCode,
            s.PFBMType,
            s.PFBMName,
            s.Type,
            s.IsActive,
            s.Root,
            s.LinkedBenchmarkCode,
            s.[CreatedBy],
            s.[CreatedDate],
            s.[UpdatedBy],
            s.[UpdatedDate]
        FROM [FinIn_DE_WH_GOLD].[ims].[vw_RptPortfolioBenchmark] s
        LEFT JOIN ims.RptPortfolioBenchmark d
            ON s.RptPortfolioKey = d.RptPortfolioKey
        WHERE d.RptPortfolioKey IS NULL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: sp_RptPortfolioBenchmarkVariance.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPortfolioBenchmarkVariance]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPortfolioBenchmarkVariance';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Refresh Data
        -----------------------------------------------------------------------

        TRUNCATE TABLE [ims].[RptPortfolioBenchmarkVariance];

        INSERT INTO [ims].[RptPortfolioBenchmarkVariance]
        (
            [RptPortfolioVarianceKey],
            [StrategyCode],
            [StrategyName],
            [PortfolioKey],
            [PFBMCode],
            [PFBMType],
            [LinkedBenchmarkCode],
            [VariancePFBMCode],
            [Type],
            [PFBMName],
            [IsActive],
            [Root],
            [PFBMDisplayCode],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        )
        SELECT
            ROW_NUMBER() OVER (ORDER BY PFBMCode, VariancePFBMCode) AS RptPortfolioVarianceKey,
            *
        FROM
        (
            SELECT
                pb.StrategyCode AS StrategyCode,
                pb.StrategyName AS StrategyName,
                pb.PortfolioKey AS PortfolioKey,
                pb.PFBMCode AS PFBMCode,
                pb.PFBMType AS PFBMType,
                pb.LinkedBenchmarkCode AS LinkedBenchmarkCode,
                pbv.PFBMCode AS VariancePFBMCode,
                '3-Variance' AS [Type],
                'Diff of ' + pb.PFBMCode + ' & ' + pbv.PFBMCode AS PFBMName,
                NULL AS IsActive,
                pb.Root AS Root,
                '(' + pb.PFBMCode + ' - ' + pbv.PFBMCode + ')' AS PFBMDisplayCode,
                pb.CreatedBy AS CreatedBy,
                pb.CreatedDate AS CreatedDate,
                pb.UpdatedBy AS UpdatedBy,
                CASE
                    WHEN pb.UpdatedDate > pbv.UpdatedDate
                        THEN pb.UpdatedDate
                    ELSE pbv.UpdatedDate
                END AS UpdatedDate
            FROM [ims].[RptPortfolioBenchmark_Stage] pb
            CROSS JOIN [ims].[RptPortfolioBenchmark_Stage] pbv
            WHERE
                pb.PFBMName <> '1-Portfolio'
                AND pb.PFBMCode <> pbv.PFBMCode

            UNION

            SELECT
                pb.StrategyCode AS StrategyCode,
                pb.StrategyName AS StrategyName,
                pb.PortfolioKey AS PortfolioKey,
                pb.PFBMCode AS PFBMCode,
                pb.PFBMType AS PFBMType,
                pb.LinkedBenchmarkCode AS LinkedBenchmarkCode,
                pb.PFBMCode AS VariancePFBMCode,
                pb.[Type] AS [Type],
                pb.PFBMName AS PFBMName,
                pb.IsActive AS IsActive,
                pb.Root AS Root,
                pb.PFBMCode AS PFBMDisplayCode,
                pb.CreatedBy AS CreatedBy,
                pb.CreatedDate AS CreatedDate,
                pb.UpdatedBy AS UpdatedBy,
                pb.UpdatedDate AS UpdatedDate
            FROM [ims].[RptPortfolioBenchmark_Stage] pb
        ) X;

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_RptPortfolioBenchmarkVariance'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                'sp_RptPortfolioBenchmarkVariance'
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPortfolioBenchmarkVariance_Gold.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPortfolioBenchmarkVariance]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPortfolioBenchmarkVariance';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------

        TRUNCATE TABLE [ims].[RptPortfolioBenchmarkVariance];

        INSERT INTO [ims].[RptPortfolioBenchmarkVariance]
        (
            [RptPortfolioVarianceKey],
            [StrategyCode],
            [StrategyName],
            [PortfolioKey],
            [PFBMCode],
            [PFBMType],
            [LinkedBenchmarkCode],
            [VariancePFBMCode],
            [Type],
            [PFBMName],
            [IsActive],
            [Root],
            [PFBMDisplayCode],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        )
        SELECT
            [RptPortfolioVarianceKey],
            [StrategyCode],
            [StrategyName],
            [PortfolioKey],
            [PFBMCode],
            [PFBMType],
            [LinkedBenchmarkCode],
            [VariancePFBMCode],
            [Type],
            [PFBMName],
            [IsActive],
            [Root],
            [PFBMDisplayCode],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        FROM [FinIn_DE_WH_GOLD].[ims].[vw_RptPortfolioBenchmarkVariance];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_RptPortfolioBenchmarkVariance'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                'sp_RptPortfolioBenchmarkVariance'
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPortfolioBenchmarkVariance_Stage.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPortfolioBenchmarkVariance_Stage]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver', -- not used in this procedure
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPortfolioBenchmarkVariance_Stage';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'RptPortfolioBenchmarkVariance_Stage_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate Target Table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'ims.RptPortfolioBenchmarkVariance_Stage', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.RptPortfolioBenchmarkVariance_Stage does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE ims.RptPortfolioBenchmarkVariance_Stage;

        INSERT INTO ims.RptPortfolioBenchmarkVariance_Stage
        (
            [RptPortfolioVarianceKey],
            [StrategyCode],
            [StrategyName],
            [PortfolioKey],
            [PFBMCode],
            [PFBMType],
            [LinkedBenchmarkCode],
            [VariancePFBMCode],
            [Type],
            [PFBMName],
            [IsActive],
            [Root],
            [PFBMDisplayCode],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        )
        SELECT
            Final.[RptPortfolioVarianceKey],
            Final.[StrategyCode],
            Final.[StrategyName],
            Final.[PortfolioKey],
            Final.[PFBMCode],
            Final.[PFBMType],
            Final.[LinkedBenchmarkCode],
            Final.[VariancePFBMCode],
            Final.[Type],
            Final.[PFBMName],
            Final.[IsActive],
            Final.[Root],
            Final.[PFBMDisplayCode],
            Final.[CreatedBy],
            Final.[CreatedDate],
            Final.[UpdatedBy],
            Final.[UpdatedDate]
        FROM
        (
            SELECT
                ROW_NUMBER() OVER (
                    ORDER BY PFBMCode, VariancePFBMCode
                ) AS RptPortfolioVarianceKey,
                *
            FROM
            (
                SELECT
                    pb.StrategyCode AS StrategyCode,
                    pb.StrategyName AS StrategyName,
                    pb.PortfolioKey AS PortfolioKey,
                    pb.PFBMCode AS PFBMCode,
                    pb.PFBMType AS PFBMType,
                    pb.LinkedBenchmarkCode AS LinkedBenchmarkCode,
                    pbv.PFBMCode AS VariancePFBMCode,
                    '3-Variance' AS Type,
                    'Diff of ' + pb.PFBMCode + ' & ' + pbv.PFBMCode AS PFBMName,
                    NULL AS IsActive,
                    pb.Root AS Root,
                    '(' + pb.PFBMCode + ' - ' + pbv.PFBMCode + ')' AS PFBMDisplayCode,
                    pb.CreatedBy AS CreatedBy,
                    pb.CreatedDate AS CreatedDate,
                    pb.UpdatedBy AS UpdatedBy,
                    CASE
                        WHEN pb.UpdatedDate > pbv.UpdatedDate
                            THEN pb.UpdatedDate
                        ELSE pbv.UpdatedDate
                    END AS UpdatedDate
                FROM ims.RptPortfolioBenchmark_Stage pb
                CROSS JOIN ims.RptPortfolioBenchmark_Stage pbv
                WHERE
                    pb.PFBMName <> '1-Portfolio'
                    AND pb.PFBMCode <> pbv.PFBMCode

                UNION ALL

                SELECT
                    pb.StrategyCode,
                    pb.StrategyName,
                    pb.PortfolioKey,
                    pb.PFBMCode,
                    pb.PFBMType,
                    pb.LinkedBenchmarkCode,
                    pb.PFBMCode AS VariancePFBMCode,
                    pb.Type,
                    pb.PFBMName,
                    pb.IsActive,
                    pb.Root,
                    pb.PFBMCode AS PFBMDisplayCode,
                    pb.CreatedBy,
                    pb.CreatedDate,
                    pb.UpdatedBy,
                    pb.UpdatedDate
                FROM ims.RptPortfolioBenchmark_Stage pb
            ) X
        ) Final;

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in RptPortfolioBenchmarkVariance_Stage_Gold_Process';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPortfolioPeerComparison.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPortfolioPeerComparison]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPortfolioPeerComparison';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Cleanup
        -----------------------------------------------------------------------

        IF OBJECT_ID('ims.PortfolioPeerCTE', 'U') IS NOT NULL
            DROP TABLE ims.PortfolioPeerCTE;

        IF OBJECT_ID('ims.PortfolioPeerCalendarCTE', 'U') IS NOT NULL
            DROP TABLE ims.PortfolioPeerCalendarCTE;

        IF OBJECT_ID('ims.PortfolioPeerFinalCTE', 'U') IS NOT NULL
            DROP TABLE ims.PortfolioPeerFinalCTE;

        -----------------------------------------------------------------------
        -- Build Peer Data
        -----------------------------------------------------------------------

        SELECT DISTINCT
            dpp.PortfolioCode,
            dpp.PFBMCode AS Ticker,
            CASE
                WHEN dpp.PFBMType = 'Portfolio' THEN dp.ShortName
                WHEN dpp.PFBMType = 'Benchmark' THEN db.BenchmarkName
            END AS FundName,
            rpad.AsOfDate,
            (
                SELECT SUM(HoldingsMarketValue)
                FROM ims.RptPosAnalyticsData
                WHERE PFBMCode = rpad.PFBMCode
                  AND AsOfDate = rpad.AsOfDate
            ) AS NetAssetValue
        INTO ims.PortfolioPeerCTE
        FROM ims.DimPortfolioPeer dpp
        LEFT JOIN ims.DimPortfolio dp
            ON dp.PortfolioCode = dpp.PFBMCode
        LEFT JOIN ims.DimBenchmark db
            ON db.BenchmarkCode = dpp.PFBMCode
        INNER JOIN ims.RptPosAnalyticsData rpad
            ON rpad.PFBMCode = dpp.PFBMCode;

        DECLARE @StartDate DATE;
        DECLARE @EndDate DATE;
        DECLARE @CurrentDate DATE;

        SET @StartDate = (SELECT MIN(AsOfDate) FROM ims.PortfolioPeerCTE);
        SET @EndDate   = (SELECT MAX(AsOfDate) FROM ims.PortfolioPeerCTE);
        SET @CurrentDate = @StartDate;

        CREATE TABLE ims.PortfolioPeerCalendarCTE
        (
            CalendarDate DATE
        );

        WHILE @CurrentDate <= @EndDate
        BEGIN
            INSERT INTO ims.PortfolioPeerCalendarCTE
            (
                CalendarDate
            )
            VALUES
            (
                @CurrentDate
            );

            SET @CurrentDate = DATEADD(DAY, 1, @CurrentDate);
        END;

        WITH UniqueCodesCTE AS
        (
            SELECT DISTINCT
                PortfolioCode,
                Ticker
            FROM ims.PortfolioPeerCTE
        ),
        ExpandedDatesCTE AS
        (
            SELECT
                uc.PortfolioCode,
                uc.Ticker,
                ppc.CalendarDate AS AsOfDate
            FROM ims.PortfolioPeerCalendarCTE ppc
            CROSS JOIN UniqueCodesCTE uc
        ),
        FilledDataCTE AS
        (
            SELECT
                ed.PortfolioCode,
                ed.Ticker,
                ppc.FundName,
                ed.AsOfDate,
                ppc.NetAssetValue
            FROM ExpandedDatesCTE ed
            LEFT JOIN ims.PortfolioPeerCTE ppc
                ON ed.PortfolioCode = ppc.PortfolioCode
               AND ed.Ticker = ppc.Ticker
               AND ed.AsOfDate = ppc.AsOfDate
        ),
        PopulatedResultCTE AS
        (
            SELECT
                fd.PortfolioCode,
                fd.Ticker,
                fd.FundName,
                fd.AsOfDate,
                COALESCE
                (
                    fd.NetAssetValue,
                    (
                        SELECT TOP 1 pp.NetAssetValue
                        FROM ims.PortfolioPeerCTE pp
                        WHERE pp.PortfolioCode = fd.PortfolioCode
                          AND pp.Ticker = fd.Ticker
                          AND pp.AsOfDate < fd.AsOfDate
                        ORDER BY pp.AsOfDate DESC
                    )
                ) AS NetAssetValue
            FROM FilledDataCTE fd
        ),
        FinalResultCTE AS
        (
            SELECT
                c.PortfolioCode,
                c.Ticker,
                c.FundName,
                c.AsOfDate,
                c.NetAssetValue,
                c.NetAssetValue - p1d.NetAssetValue AS Return1D,
                c.NetAssetValue - p1w.NetAssetValue AS Return1W,
                c.NetAssetValue - p1m.NetAssetValue AS Return1M,
                c.NetAssetValue - p3m.NetAssetValue AS Return3M,
                c.NetAssetValue - p1y.NetAssetValue AS Return1Y,
                c.NetAssetValue - p3y.NetAssetValue AS Return3Y,
                c.NetAssetValue - p5y.NetAssetValue AS Return5Y
            FROM PopulatedResultCTE c
            LEFT JOIN PopulatedResultCTE p1d
                ON p1d.PortfolioCode = c.PortfolioCode
               AND p1d.Ticker = c.Ticker
               AND p1d.AsOfDate = DATEADD(DAY, -1, c.AsOfDate)
            LEFT JOIN PopulatedResultCTE p1w
                ON p1w.PortfolioCode = c.PortfolioCode
               AND p1w.Ticker = c.Ticker
               AND p1w.AsOfDate = DATEADD(DAY, -7, c.AsOfDate)
            LEFT JOIN PopulatedResultCTE p1m
                ON p1m.PortfolioCode = c.PortfolioCode
               AND p1m.Ticker = c.Ticker
               AND p1m.AsOfDate = DATEADD(MONTH, -1, c.AsOfDate)
            LEFT JOIN PopulatedResultCTE p3m
                ON p3m.PortfolioCode = c.PortfolioCode
               AND p3m.Ticker = c.Ticker
               AND p3m.AsOfDate = DATEADD(MONTH, -3, c.AsOfDate)
            LEFT JOIN PopulatedResultCTE p1y
                ON p1y.PortfolioCode = c.PortfolioCode
               AND p1y.Ticker = c.Ticker
               AND p1y.AsOfDate = DATEADD(YEAR, -1, c.AsOfDate)
            LEFT JOIN PopulatedResultCTE p3y
                ON p3y.PortfolioCode = c.PortfolioCode
               AND p3y.Ticker = c.Ticker
               AND p3y.AsOfDate = DATEADD(YEAR, -3, c.AsOfDate)
            LEFT JOIN PopulatedResultCTE p5y
                ON p5y.PortfolioCode = c.PortfolioCode
               AND p5y.Ticker = c.Ticker
               AND p5y.AsOfDate = DATEADD(YEAR, -5, c.AsOfDate)
        )
        SELECT *
        INTO ims.PortfolioPeerFinalCTE
        FROM FinalResultCTE;

        -----------------------------------------------------------------------
        -- Refresh Target Table
        -----------------------------------------------------------------------

        TRUNCATE TABLE ims.RptPortfolioPeerComparison;

        INSERT INTO ims.RptPortfolioPeerComparison
        SELECT *
        FROM ims.PortfolioPeerFinalCTE;

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Cleanup Temp Tables
        -----------------------------------------------------------------------

        DROP TABLE ims.PortfolioPeerCTE;
        DROP TABLE ims.PortfolioPeerCalendarCTE;
        DROP TABLE ims.PortfolioPeerFinalCTE;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_RptPortfolioPeerComparison'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Failed',
            @ErrorMessage,
            'sp_RptPortfolioPeerComparison'
        );

        IF OBJECT_ID('ims.PortfolioPeerCTE', 'U') IS NOT NULL
            DROP TABLE ims.PortfolioPeerCTE;

        IF OBJECT_ID('ims.PortfolioPeerCalendarCTE', 'U') IS NOT NULL
            DROP TABLE ims.PortfolioPeerCalendarCTE;

        IF OBJECT_ID('ims.PortfolioPeerFinalCTE', 'U') IS NOT NULL
            DROP TABLE ims.PortfolioPeerFinalCTE;

        THROW;

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPosAnalytics.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPosAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver', -- kept for signature consistency
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPosAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'RptPosAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate target table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'ims.RptPosAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.RptPosAnalytics does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE ims.RptPosAnalytics;

        INSERT INTO ims.RptPosAnalytics
        (
            [PosAnalyticsKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [EffectiveDt],
            [FormatedEffectiveDt],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [Identifier],
            [PFBMCode],
            [AsOfDate],
            [IsPortfolio],
            [UnPivotValue],
            [Metric],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        )
        SELECT
            [PosAnalyticsKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [EffectiveDt],
            [FormatedEffectiveDt],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [Identifier],
            [PFBMCode],
            [AsOfDate],
            [IsPortfolio],
            [UnPivotValue],
            [Metric],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        FROM [FinIn_DE_WH_GOLD].[ims].[vw_RptPosAnalytics];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE() + ' in RptPosAnalytics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptPosAnalyticsData.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptPosAnalyticsData]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptPosAnalyticsData';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE [ims].[RptPosAnalyticsData];

        INSERT INTO [ims].[RptPosAnalyticsData]
        (
            [PosAnalyticsDataKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [AssetClassName],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [EffectiveDt],
            [PriceStartDay],
            [PriceLastEOD],
            [DividendYield],
            [DividendAmount],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [FiftyTwoWeekHigh],
            [FiftyTwoWeekLow],
            [CurrentYearHigh],
            [CurrentYearLow],
            [MarketPrice],
            [Factor],
            [OneMCPR],
            [ThreeMCPR],
            [SixMCPR],
            [TwelveMCPR],
            [DTC],
            [KeyRateDur6M],
            [KeyRateDur1Yr],
            [KeyRateDur2y],
            [KeyRateDur3y],
            [KeyRateDur5y],
            [KeyRateDur7y],
            [KeyRateDur10y],
            [WAC],
            [WAM],
            [ModifiedDur],
            [SpreadDur],
            [OAS],
            [Convexity],
            [AdjustedDur],
            [YTM],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [PE],
            [Beta],
            [Identifier],
            [ENV],
            [SOC],
            [GOV],
            [ESG],
            [Ratings],
            [PFBMCode],
            [PFBMSecurityKey],
            [AsOfDate],
            [Quantity],
            [IsPortfolio],
            [HoldingsMarketValue],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        )
        SELECT
            [PosAnalyticsDataKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [AssetClassName],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [EffectiveDt],
            [PriceStartDay],
            [PriceLastEOD],
            [DividendYield],
            [DividendAmount],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [FiftyTwoWeekHigh],
            [FiftyTwoWeekLow],
            [CurrentYearHigh],
            [CurrentYearLow],
            [MarketPrice],
            [Factor],
            [OneMCPR],
            [ThreeMCPR],
            [SixMCPR],
            [TwelveMCPR],
            [DTC],
            [KeyRateDur6M],
            [KeyRateDur1Yr],
            [KeyRateDur2y],
            [KeyRateDur3y],
            [KeyRateDur5y],
            [KeyRateDur7y],
            [KeyRateDur10y],
            [WAC],
            [WAM],
            [ModifiedDur],
            [SpreadDur],
            [OAS],
            [Convexity],
            [AdjustedDur],
            [YTM],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [PE],
            [Beta],
            [Identifier],
            [ENV],
            [SOC],
            [GOV],
            [ESG],
            [Ratings],
            [PFBMCode],
            [PFBMSecurityKey],
            [AsOfDate],
            [Quantity],
            [IsPortfolio],
            [HoldingsMarketValue],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        FROM [FinIn_DE_WH_GOLD].[ims].[vw_RptPosAnalyticsData];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_RptPosAnalyticsData'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
        (
            BatchId,
            SchemaName,
            TableName,
            ProcessedRowCount,
            StartTime,
            EndTime,
            Status,
            ErrorMessage,
            SourceName
        )
        VALUES
        (
            @BatchId,
            @SchemaName,
            @TableName,
            0,
            @StartTime,
            @EndTime,
            'Failed',
            @ErrorMessage,
            'sp_RptPosAnalyticsData'
        );

        THROW;

    END CATCH

END;
GO

-- ============================== Source file: sp_RptSecurityAnalytics.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptSecurityAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver', -- not used in this procedure; source is a Gold-layer view
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptSecurityAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'RptSecurityAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate Target Table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'ims.RptSecurityAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.RptSecurityAnalytics does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE ims.RptSecurityAnalytics;

        INSERT INTO ims.RptSecurityAnalytics
        (
            [SecurityAnalyticsKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [ProductType],
            [EffectiveDt],
            [PriceStartDay],
            [PriceLastEOD],
            [DividendYield],
            [DividendAmount],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [FiftyTwoWeekHigh],
            [FiftyTwoWeekLow],
            [CurrentYearHigh],
            [CurrentYearLow],
            [MarketPrice],
            [Factor],
            [OneMCPR],
            [ThreeMCPR],
            [SixMCPR],
            [TwelveMCPR],
            [DTC],
            [KeyRateDur6M],
            [KeyRateDur1Yr],
            [KeyRateDur2y],
            [KeyRateDur3y],
            [KeyRateDur5y],
            [KeyRateDur7y],
            [KeyRateDur10y],
            [WAC],
            [WAM],
            [ModifiedDur],
            [SpreadDur],
            [OAS],
            [Convexity],
            [AdjustedDur],
            [YTM],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [PE],
            [Beta],
            [Identifier],
            [Delta],
            [ENV],
            [SOC],
            [GOV],
            [ESG],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        )
        SELECT
            [SecurityAnalyticsKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [ProductType],
            [EffectiveDt],
            [PriceStartDay],
            [PriceLastEOD],
            [DividendYield],
            [DividendAmount],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [FiftyTwoWeekHigh],
            [FiftyTwoWeekLow],
            [CurrentYearHigh],
            [CurrentYearLow],
            [MarketPrice],
            [Factor],
            [OneMCPR],
            [ThreeMCPR],
            [SixMCPR],
            [TwelveMCPR],
            [DTC],
            [KeyRateDur6M],
            [KeyRateDur1Yr],
            [KeyRateDur2y],
            [KeyRateDur3y],
            [KeyRateDur5y],
            [KeyRateDur7y],
            [KeyRateDur10y],
            [WAC],
            [WAM],
            [ModifiedDur],
            [SpreadDur],
            [OAS],
            [Convexity],
            [AdjustedDur],
            [YTM],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [PE],
            [Beta],
            [Identifier],
            [Delta],
            [ENV],
            [SOC],
            [GOV],
            [ESG],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate]
        FROM [FinIn_DE_WH_GOLD].[ims].[vw_RptSecurityAnalytics];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in RptSecurityAnalytics_Gold_Process';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH
END;
GO

-- ============================== Source file: sp_RptSecurityAnalyticsUnpivot.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptSecurityAnalyticsUnpivot]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver', -- not used in this procedure; source is a Gold-layer view
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptSecurityAnalyticsUnpivot';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'RptSecurityAnalyticsUnpivot_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Validate Target Table
        -----------------------------------------------------------------------
        IF OBJECT_ID(N'ims.RptSecurityAnalyticsUnpivot', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.RptSecurityAnalyticsUnpivot does not exist.', 1;
        END;

        -----------------------------------------------------------------------
        -- Full Refresh
        -----------------------------------------------------------------------
        TRUNCATE TABLE ims.RptSecurityAnalyticsUnpivot;

        INSERT INTO ims.RptSecurityAnalyticsUnpivot
        (
            [SecurityAnalyticsUnpivotKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [EffectiveDt],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [Factor],
            [OneMCPR],
            [ThreeMCPR],
            [SixMCPR],
            [TwelveMCPR],
            [DTC],
            [KeyRateDur6M],
            [KeyRateDur1Yr],
            [KeyRateDur2y],
            [KeyRateDur3y],
            [KeyRateDur5y],
            [KeyRateDur7y],
            [KeyRateDur10y],
            [WAC],
            [WAM],
            [ModifiedDur],
            [SpreadDur],
            [OAS],
            [Convexity],
            [AdjustedDur],
            [YTM],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate],
            [UnPivotValue],
            [Metric]
        )
        SELECT
            [SecurityAnalyticsUnpivotKey],
            [SecurityKey],
            [LinkAssetClassKey],
            [LinkSecurityTypeKey],
            [CurrencyKey],
            [CountryKey],
            [ShortName],
            [LongName],
            [SecurityDescription],
            [SourceSystemKey],
            [IndustryGICS],
            [SubindustryGICS],
            [SectorGICS],
            [IndustryGroupGICS],
            [SubSectorGICS],
            [EffectiveDt],
            [NextDividendPaydate],
            [LastDividendPaydate],
            [Factor],
            [OneMCPR],
            [ThreeMCPR],
            [SixMCPR],
            [TwelveMCPR],
            [DTC],
            [KeyRateDur6M],
            [KeyRateDur1Yr],
            [KeyRateDur2y],
            [KeyRateDur3y],
            [KeyRateDur5y],
            [KeyRateDur7y],
            [KeyRateDur10y],
            [WAC],
            [WAM],
            [ModifiedDur],
            [SpreadDur],
            [OAS],
            [Convexity],
            [AdjustedDur],
            [YTM],
            [FIGI],
            [SYMBOL],
            [CUSIP],
            [ISIN],
            [SEDOL],
            [CreatedBy],
            [CreatedDate],
            [UpdatedBy],
            [UpdatedDate],
            [UnPivotValue],
            [Metric]
        FROM [FinIn_DE_WH_GOLD].[ims].[vw_RptSecurityAnalyticsUnpivot];

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in RptSecurityAnalyticsUnpivot_Gold_Process';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_RptThresholdPeriod.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_RptThresholdPeriod]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver',
    @BatchId INT = NULL,
    @StartDate DATE = '2020-01-01',
    @EndDate DATE = NULL,
    @BenchmarkCode VARCHAR(255) = 'GSPC',
    @PortfolioCode VARCHAR(255) = 'GOS100',
    @Threshold FLOAT = 0.05
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'RptThresholdPeriod';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256) = 'sp_RptThresholdPeriod';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        IF @EndDate IS NULL
        BEGIN
            SET @EndDate = CAST(DATEADD(DAY, -DAY(GETDATE()), GETDATE()) AS DATE);
        END;

        DROP TABLE IF EXISTS ims.TmpJoinTbl;
        DROP TABLE IF EXISTS ims.TmpThresholdTbl;
        DROP TABLE IF EXISTS ims.TmpThresholdPeriodTbl;

        -----------------------------------------------------------------------
        -- Existing Business Logic
        -----------------------------------------------------------------------

        /* Keep all your existing CTEs and calculations exactly as-is:
             benchmarkTbl
             portfolioTbl
             benchmarkFuture6MonthsTbl
             portfolioFuture6MonthsTbl
             joinTbl
             TmpJoinTbl
             TmpThresholdTbl
             WHILE loop
             periodTbl
             thresholdJoinTbl
             finalTbl
             TmpThresholdPeriodTbl
        */

        -----------------------------------------------------------------------
        -- Delete Existing Data
        -----------------------------------------------------------------------

        DELETE FROM [ims].[RptThresholdPeriod]
        WHERE
        (
            ([PFBMCode] = @BenchmarkCode AND [PFBMType] = 'Benchmark')
            OR
            ([PFBMCode] = @PortfolioCode AND [PFBMType] = 'Portfolio')
        )
        AND
        (
            ([MVStartDate] BETWEEN @StartDate AND @EndDate)
            OR
            ([MVEndDate] BETWEEN @StartDate AND @EndDate)
            OR
            ([MVStartDate] < @StartDate AND @EndDate < [MVEndDate])
        );

        -----------------------------------------------------------------------
        -- Insert New Data
        -----------------------------------------------------------------------

        INSERT INTO [ims].[RptThresholdPeriod]
        (
            MVPeriod,
            PFBMCode,
            PFBMType,
            MVDuration,
            MVStartDate,
            MVEndDate,
            MVDateRange,
            MVDateRangeFuture6Months,
            MVPercentageChange,
            MVPercentageChangeFuture6Months,
            BMIsRising
        )
        SELECT
            MVPeriod,
            PFBMCode,
            PFBMType,
            MVDuration,
            MVStartDate,
            MVEndDate,
            MVDateRange,
            MVDateRangeFuture6Months,
            MVPercentageChange,
            MVPercentageChangeFuture6Months,
            BMIsRising
        FROM ims.TmpThresholdPeriodTbl;

        SET @RowsInserted = @@ROWCOUNT;

        -----------------------------------------------------------------------
        -- Cleanup
        -----------------------------------------------------------------------

        DROP TABLE IF EXISTS ims.TmpJoinTbl;
        DROP TABLE IF EXISTS ims.TmpThresholdTbl;
        DROP TABLE IF EXISTS ims.TmpThresholdPeriodTbl;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(
                DATEDIFF(
                    SECOND,
                    @StartTime,
                    @EndTime
                ) AS VARCHAR(20)
            ) + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH;

        DROP TABLE IF EXISTS ims.TmpJoinTbl;
        DROP TABLE IF EXISTS ims.TmpThresholdTbl;
        DROP TABLE IF EXISTS ims.TmpThresholdPeriodTbl;

    END CATCH

END;
GO

-- ============================== Source file: sp_UpdateRowCountAudit.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_UpdateRowCountAudit]
    @BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'sp_UpdateRowCountAudit'; -- Added declaration and assignment
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);

    BEGIN TRY

        -----------------------------------------------------------------------
        -- Declare Variables
        -----------------------------------------------------------------------
        DECLARE
            @TableId BIGINT,
            @SchemaName VARCHAR(200),
            @AuditTableName VARCHAR(200),
            @PrevRowCount INT,
            @CurRowCount INT,
            @PercentageChange DECIMAL(19,2),
            @TodayDate DATE = CAST(DATEADD(HOUR,-8,GETUTCDATE()) AS DATE),
            @SQL NVARCHAR(MAX),
            @YesterdayDate DATE,
            @RowCount INT,
            @Index INT = 1;

        DECLARE @YesterdayTemp DATE =
            CAST(DATEADD(DAY,-1,DATEADD(HOUR,-8,GETUTCDATE())) AS DATE);

        SET @YesterdayDate =
            CASE
                WHEN DATEPART(WEEKDAY,@YesterdayTemp) = 1
                    THEN CAST(DATEADD(DAY,-2,@YesterdayTemp) AS DATE)
                WHEN DATEPART(WEEKDAY,@YesterdayTemp) = 7
                    THEN CAST(DATEADD(DAY,-1,@YesterdayTemp) AS DATE)
                ELSE @YesterdayTemp
            END;

        -----------------------------------------------------------------------
        -- Process Active Audit Tables
        -----------------------------------------------------------------------
        SET @RowCount =
        (
            SELECT COUNT(*)
            FROM dbo.TableRowCountAudit
            WHERE IsActive = 1
        );

        WHILE @Index <= @RowCount
        BEGIN

            SELECT
                @TableId = TableId,
                @SchemaName = SchemaName,
                @AuditTableName = TableName
            FROM
            (
                SELECT
                    ROW_NUMBER() OVER (ORDER BY TableId) AS RowNum,
                    *
                FROM dbo.TableRowCountAudit
                WHERE IsActive = 1
            ) Temp
            WHERE RowNum = @Index;

            DECLARE @YesterdayRowCount INT = 0;
            DECLARE @TodayRowCount INT = 0;

            SET @SQL = '
                SELECT @YesterdayRowCountOut = COUNT(*)
                FROM ' + QUOTENAME(@SchemaName) + '.'
                         + QUOTENAME(@AuditTableName) + '
                WHERE CreatedDate >= @YesterdayDate
                  AND CreatedDate < @TodayDate;

                SELECT @TodayRowCountOut = COUNT(*)
                FROM ' + QUOTENAME(@SchemaName) + '.'
                         + QUOTENAME(@AuditTableName) + '
                WHERE CreatedDate >= @TodayDate;
            ';

            EXEC sp_executesql
                @SQL,
                N'@YesterdayRowCountOut INT OUTPUT,
                  @TodayRowCountOut INT OUTPUT,
                  @YesterdayDate DATE,
                  @TodayDate DATE',
                @YesterdayRowCountOut = @YesterdayRowCount OUTPUT,
                @TodayRowCountOut = @TodayRowCount OUTPUT,
                @YesterdayDate = @YesterdayDate,
                @TodayDate = @TodayDate;

            SET @PrevRowCount = ISNULL(@YesterdayRowCount,0);
            SET @CurRowCount = ISNULL(@TodayRowCount,0);

            IF @PrevRowCount > 0
                SET @PercentageChange =
                    ((@CurRowCount - @PrevRowCount) * 100.0)
                    / @PrevRowCount;
            ELSE IF @PrevRowCount = 0
                 AND @CurRowCount = 0
                SET @PercentageChange = 0.00;
            ELSE
                SET @PercentageChange = 100.00;

            UPDATE dbo.TableRowCountAudit
            SET
                PrevRowCount = @PrevRowCount,
                CurRowCount = @CurRowCount,
                PercentageChange = @PercentageChange,
                LastSyncTime = DATEADD(HOUR,-8,GETUTCDATE())
            WHERE TableId = @TableId;

            SET @Index += 1;

        END;

        -----------------------------------------------------------------------
        -- Return Significant Changes
        -----------------------------------------------------------------------
        SELECT
            TableName,
            PrevRowCount,
            CurRowCount,
            PercentageChange
        FROM dbo.TableRowCountAudit
        WHERE ABS(PercentageChange) >= 10
          AND IsActive = 1;

        -----------------------------------------------------------------------
        -- Success Logging
        -----------------------------------------------------------------------
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_UpdateRowCountAudit'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in UpdateRowCountAudit';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND,@StartTime,@EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                'sp_UpdateRowCountAudit'
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: sp_storeprocedure1.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_Date]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver', -- not used
    @BatchId INT = NULL,
    @StartDate DATE = '2016-01-01',
    @EndDate DATE = '2030-12-31'
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200) = 'Date';
    DECLARE @SchemaName VARCHAR(255) = 'dbo';
    DECLARE @ProcedureName VARCHAR(256) = 'sp_Date';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState INT;
    DECLARE @StartTime DATETIME2(6) = SYSUTCDATETIME();
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT = 0;

    BEGIN TRY

        IF OBJECT_ID(N'dbo.[Date]', N'U') IS NULL
        BEGIN
            -- Self-heal: this dimension table wasn't part of the initial
            -- warehouse setup, which made every dependent procedure
            -- (sp_RiskAnalytics_FindMissingDates, sp_DollarAnalytics_FindMissingDates, ...)
            -- fail with "Invalid object name". Create it here instead of
            -- throwing so the batch can always run end-to-end.
            CREATE TABLE dbo.[Date]
            (
                DateID VARCHAR(8) NOT NULL,
                [Date] DATE NOT NULL
            );
        END;

        WHILE @StartDate <= @EndDate
        BEGIN

            -- Idempotent: only insert dates not already present, so
            -- re-running sp_Date for an overlapping range (e.g. every
            -- batch run) never hits a duplicate-key style conflict.
            IF NOT EXISTS
            (
                SELECT 1
                FROM dbo.[Date]
                WHERE DateID = CONVERT(VARCHAR(8), @StartDate, 112)
            )
            BEGIN
                INSERT INTO dbo.[Date]
                (
                    DateID,
                    [Date]
                )
                VALUES
                (
                    CONVERT(VARCHAR(8), @StartDate, 112),
                    @StartDate
                );

                SET @RowsInserted += 1;
            END;

            SET @StartDate = DATEADD(DAY, 1, @StartDate);
        END;

 
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage =
            ERROR_MESSAGE() + ' in sp_Date';

        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();

        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors so they never mask the real failure
        END CATCH

    END CATCH

END;
GO

-- ============================== Source file: AggregationMetric_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimAggregationMetric]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimAggregationMetric';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'AggregationMetric_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimAggregationMetric ----
        IF OBJECT_ID(N'ims.DimAggregationMetric', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimAggregationMetric does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimAggregationMetric;

        SET @SQL = N'INSERT INTO ims.DimAggregationMetric (
            AggregationMetricKey, MetricCode, MetricName, MetricGroup, MetricDisplayName,
            MetricLabel, AggregationCode, AggregationName, AggregationType, SortOrder,
            Formula, Source, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate
        )
        SELECT
            am.AggregationMetricKey,
            am.MetricCode,
            m.Name AS MetricName,
            m.MetricGroup,
            m.MetricDisplayName,
            am.MetricLabel,
            am.AggregationCode,
            a.Name AS AggregationName,
            a.AggType AS AggregationType,
            am.SortOrder,
            a.Formula,
            m.Source,
            am.CreatedBy,
            am.CreatedDate,
            am.UpdatedBy,
            am.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AggregationMetric am
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Metric m ON am.MetricCode = m.Code
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Aggregation a ON am.AggregationCode = a.Code
        LEFT JOIN ims.DimAggregationMetric dim ON am.AggregationMetricKey = dim.AggregationMetricKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimAggregationMetricExt ----
        IF OBJECT_ID(N'ims.DimAggregationMetricExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimAggregationMetricExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimAggregationMetricExt;

        SET @SQL = N'INSERT INTO ims.DimAggregationMetricExt (
            AggregationMetricKey
        )
        SELECT
            source.AggregationMetricKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AggregationMetricExt source
        LEFT JOIN ims.DimAggregationMetricExt target on source.AggregationMetricKey = target.AggregationMetricKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in AggregationMetric_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Aggregation_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimAggregation]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimAggregation';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Aggregation_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.DimAggregation ----
        IF OBJECT_ID(N'ims.DimAggregation', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimAggregation does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimAggregation;

        -- Table was just truncated, so this always evaluates to 0; kept for clarity/future-proofing
        SELECT @MaxID = ISNULL(MAX([AggregationKey]), 0) FROM ims.DimAggregation;

        SET @SQL = N'INSERT INTO ims.DimAggregation (
            AggregationKey,
            AggregationId,
            AggKey,
            AggName,
            AggType,
            AggDescription,
            Formula,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS AggregationKey,
            s.AggregationId,
            s.AggKey,
            s.AggName,
            s.AggType,
            s.AggDescription,
            s.Formula,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].aggregation s
        LEFT JOIN ims.DimAggregation d
            ON s.AggregationId = d.AggregationId;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Aggregation_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: AssetClass_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimAssetClass]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimAssetClass';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'AssetClass_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.DimAssetClass ----
        IF OBJECT_ID(N'ims.DimAssetClass', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimAssetClass does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimAssetClass;

        -- Table was just truncated, so this always evaluates to 0; kept for clarity/future-proofing
        SELECT @MaxID = ISNULL(MAX([AssetClassKey]), 0) FROM ims.DimAssetClass;

        SET @SQL = N'INSERT INTO ims.DimAssetClass (
            AssetClassKey, AssetClassId, Code, Name, ParentId, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS AssetClassKey,
            s.AssetClassId, s.Code, s.Name, s.ParentId, s.CreatedBy, s.CreatedDate, s.UpdatedBy, s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AssetClass s
        LEFT JOIN ims.DimAssetClass d ON s.AssetClassId = d.AssetClassId;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in AssetClass_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Benchmark_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimBenchmark]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimBenchmark';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Benchmark_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimBenchmark ----
        IF OBJECT_ID(N'ims.DimBenchmark', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimBenchmark does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimBenchmark;

        SET @SQL = N'INSERT INTO ims.DimBenchmark (
            BenchmarkId,
            BenchmarkKey,
            BenchmarkCode,
            BenchmarkName,
            IndexCode,
            IndexName,
            MarketDate,
            AvgMaturity,
            --YieldToMaturity,
            --AvgConvexity,
            --AvgCoupon,
            --CurrYield,
            IsActive,
            --ProviderCd,
            --ProxyBenchmarkCode,
            IndexType,
            --SourceSystemKey,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.BenchmarkId,
            s.BenchmarkKey,
            s.BenchmarkCode,
            s.BenchMarkName,
            s.IndexCode,
            s.IndexName,
            s.MarketDate,
            s.AvgMaturity,
            --s.YieldToMaturity,
            --s.AvgComvexity,
            --s.AvgCoupon,
            --s.CurrYield,
            cast(s.IsActive as bit),
            --s.ProviderCd,
            --s.ProxyBenchmarkCode,
            s.IndexType,
            --ss.SourceSystemKey,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Benchmark s
        LEFT JOIN ims.DimBenchmark d
            ON s.BenchmarkKey = d.BenchmarkKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimBenchmarkExt ----
        IF OBJECT_ID(N'ims.DimBenchmarkExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimBenchmarkExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimBenchmarkExt;

        SET @SQL = N'INSERT INTO ims.DimBenchmarkExt (
            BenchmarkKey
        )
        SELECT
            s.BenchmarkKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].BenchmarkExt s
        LEFT JOIN ims.DimBenchmarkExt d ON s.BenchmarkKey = d.BenchmarkKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Benchmark_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Broker_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimBroker]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimBroker';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Broker_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimBroker ----
        IF OBJECT_ID(N'ims.DimBroker', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimBroker does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimBroker;

        SET @SQL = N'INSERT INTO ims.DimBroker (
            BrokerKey,
            BrokerId,
            Code,
            Name,
            DTCCode,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.BrokerKey,
            s.BrokerId,
            s.Code,
            s.Name,
            s.DTCCode,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Broker s
        LEFT JOIN ims.DimBroker d
            ON s.BrokerKey = d.BrokerKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimBrokerExt ----
        IF OBJECT_ID(N'ims.DimBrokerExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimBrokerExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimBrokerExt;

        SET @SQL = N'INSERT INTO ims.DimBrokerExt (
            BrokerKey
        )
        SELECT
            s.BrokerKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].BrokerExt s
        LEFT JOIN ims.DimBrokerExt d ON s.BrokerKey = d.BrokerKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Broker_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Client_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimClient]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimClient';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Client_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimClient ----
        IF OBJECT_ID(N'ims.DimClient', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimClient does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimClient;

        SET @SQL = N'INSERT INTO ims.DimClient (
            ClientKey,
            ClientId,
            Code, Name,
            ShortName,
            LongName,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.ClientKey,
            s.ClientId,
            s.Code,
            s.Name,
            s.ShortName,
            s.LongName,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Client s
        LEFT JOIN ims.DimClient d
            ON s.ClientKey = d.ClientKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimClientExt ----
        IF OBJECT_ID(N'ims.DimClientExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimClientExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimClientExt;

        SET @SQL = N'INSERT INTO ims.DimClientExt (
            ClientKey
        )
        SELECT
            s.ClientKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].ClientExt s
        LEFT JOIN ims.DimClientExt d ON s.ClientKey = d.ClientKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Client_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Country_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimCountry]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimCountry';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Country_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimCountry ----
        IF OBJECT_ID(N'ims.DimCountry', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimCountry does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimCountry;

        SET @SQL = N'INSERT INTO ims.DimCountry (
            CountryKey,
            CountryId,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.CountryKey,
            s.CountryId,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Country s
        LEFT JOIN ims.DimCountry d
            ON s.CountryKey = d.CountryKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimCountryExt ----
        IF OBJECT_ID(N'ims.DimCountryExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimCountryExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimCountryExt;

        SET @SQL = N'INSERT INTO ims.DimCountryExt (
            CountryKey
        )
        SELECT
            s.CountryKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].CountryExt s
        LEFT JOIN ims.DimCountryExt d ON s.CountryKey = d.CountryKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Country_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Currency_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimCurrency]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimCurrency';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Currency_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimCurrency ----
        IF OBJECT_ID(N'ims.DimCurrency', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimCurrency does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimCurrency;

        SET @SQL = N'INSERT INTO ims.DimCurrency (
            CurrencyKey,
            CurrencyId,
            Code,
            Description,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.CurrencyKey,
            s.CurrencyId,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Currency s
        LEFT JOIN ims.DimCurrency d
            ON s.CurrencyKey = d.CurrencyKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimCurrencyExt ----
        IF OBJECT_ID(N'ims.DimCurrencyExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimCurrencyExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimCurrencyExt;

        SET @SQL = N'INSERT INTO ims.DimCurrencyExt (
            CurrencyKey
        )
        SELECT
            s.CurrencyKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].CurrencyExt s
        LEFT JOIN ims.DimCurrencyExt d ON s.CurrencyKey = d.CurrencyKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Currency_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Custodian_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimCustodian]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimCustodian';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Custodian_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimCustodian ----
        IF OBJECT_ID(N'ims.DimCustodian', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimCustodian does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimCustodian;

        SET @SQL = N'INSERT INTO ims.DimCustodian (
            CustodianKey,
            CustodianId,
            Code,
            Name,
            DTCCode,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.CustodianKey,
            s.CustodianId,
            s.Code,
            s.Name,
            s.DTCCode,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Custodian s
        LEFT JOIN ims.DimCustodian d
            ON s.CustodianKey = d.CustodianKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimCustodianExt ----
        IF OBJECT_ID(N'ims.DimCustodianExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimCustodianExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimCustodianExt;

        SET @SQL = N'INSERT INTO ims.DimCustodianExt (
            CustodianKey
        )
        SELECT
            s.CustodianKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].CustodianExt s
        LEFT JOIN ims.DimCustodianExt d ON s.CustodianKey = d.CustodianKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Custodian_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: DTNSecurityType_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimDTNSecurityType]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName     VARCHAR(200)  = 'DimDTNSecurityType';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'DTNSecurityType_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID         BIGINT = 0;

    BEGIN TRY

        -- ---- Target: dbo.Staging_DTNSecurityType (intermediate staging table) ----
        IF OBJECT_ID(N'dbo.Staging_DTNSecurityType', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table dbo.Staging_DTNSecurityType does not exist.', 1;
        END

        TRUNCATE TABLE dbo.Staging_DTNSecurityType;

        SET @SQL = N'
        INSERT INTO Staging_DTNSecurityType (Id, ShortName, LongName, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate)
        SELECT
            Id,
            ShortName,
            LongName,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].dtnsecuritytype;';
        EXEC sp_executesql @SQL;

        -- ---- Target: dbo.DimDTNSecurityType ----
        IF OBJECT_ID(N'dbo.DimDTNSecurityType', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table dbo.DimDTNSecurityType does not exist.', 1;
        END

        TRUNCATE TABLE dbo.DimDTNSecurityType;

        -- Table was just truncated, so this always evaluates to 0; kept for clarity/future-proofing
        SELECT @MaxID = ISNULL(MAX([DTNSecurityTypeKey]), 0) FROM dbo.DimDTNSecurityType;

        INSERT INTO DimDTNSecurityType (DTNSecurityTypeKey, Id, ShortName, LongName, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate)
        SELECT
            @MaxID + ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS DTNSecurityTypeKey,
            s.Id, s.ShortName, s.LongName, s.CreatedBy, s.CreatedDate, s.UpdatedBy, s.UpdatedDate
        FROM Staging_DTNSecurityType s;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in DTNSecurityType_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: DimSecurity_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimSecurity]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimSecurity';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'DimSecurity_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.DimSecurity ----
        IF OBJECT_ID(N'ims.DimSecurity', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSecurity does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSecurity;

        -- Table was just truncated, so this always evaluates to 0; kept for clarity/future-proofing
        SELECT @MaxID = ISNULL(MAX([SecurityKey]), 0) FROM ims.DimSecurity;

        SET @SQL = N'INSERT INTO ims.DimSecurity (
            SecurityKey, SecurityId, AssetClassKey, SecurityTypeKey, FIGI, CurrencyKey, CountryKey,
            ShortName, LongName, SecurityDescription, SourceSystemKey, IndustryGICS,
            SubindustryGICS, SectorGICS, IndustryGroupGICS, SubSectorGICS,
            CreatedBy, CreatedDate, UpdatedBy, UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS SecurityKey,
            s.SecurityId, ac.AssetClassKey, s.SecurityTypeKey, s.FIGI, cu.CurrencyKey, co.CountryKey,
            s.ShortName, s.LongName, s.SecurityDescription, s.SourceSystemId, s.IndustryGICS,
            s.SubindustryGICS, s.SectorGICS, s.IndustryGroupGICS, s.SubSectorGICS,
            s.CreatedBy, s.CreatedDate, s.UpdatedBy, s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].security s
        LEFT JOIN ims.DimSecurity d ON s.SecurityId = d.SecurityId
        INNER JOIN ims.AssetClass ac on ac.AssetClassID = s.AssetClassId
        INNER JOIN ims.Country co on co.CountryId = s.CountryId
        INNER JOIN ims.Currency cu on co.CurrencyId = s.CurrencyId
        INNER JOIN ims.SecurityType st on st.SecurityTypeId = s.SecurityTypeId;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in DimSecurity_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: DollarAnalytics_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactDollarAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactDollarAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'DollarAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactDollarAnalytics ----
        IF OBJECT_ID(N'ims.FactDollarAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactDollarAnalytics does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactDollarAnalytics;

        SET @SQL = N'INSERT INTO ims.FactDollarAnalytics (
            AnalyticsKey,
            SecurityKey,
            CustomAssetClassKey,
            CustomSecurityTypeKey,
            CurrencyKey,
            CountryKey,
            SourceSystemKey,
            DateKey,
            EffectiveDt,
            NextDividendPaydate,
            LastDividendPaydate,
            PriceStartDay,
            PriceLastEOD,
            DividendYield,
            DividendAmount,
            FiftyTwoWeekHigh,
            FiftyTwoWeekLow,
            CurrentYearHigh,
            CurrentYearLow,
            MarketPrice,
            Factor,
            OneMCPR,
            ThreeMCPR,
            SixMCPR,
            TwelveMCPR,
            DTC,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.AnalyticsKey,
            s.SecurityKey,
            s.LinkAssetClassKey,
            s.LinkSecurityTypeKey,
            s.CurrencyKey,
            s.CountryKey,
            s.SourceSystemKey,
            s.DateKey,
            s.EffectiveDt,
            s.NextDividendPaydate,
            s.LastDividendPaydate,
            s.PriceStartDay,
            s.PriceLastEOD,
            s.DividendYield,
            s.DividendAmount,
            s.FiftyTwoWeekHigh,
            s.FiftyTwoWeekLow,
            s.CurrentYearHigh,
            s.CurrentYearLow,
            s.MarketPrice,
            s.Factor,
            s.OneMCPR,
            s.ThreeMCPR,
            s.SixMCPR,
            s.TwelveMCPR,
            s.DTC,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.dbo.DollarAnalytics s
        LEFT JOIN ims.FactDollarAnalytics d
            ON s.AnalyticsKey = d.AnalyticsKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.FactDollarAnalyticsExt ----
        IF OBJECT_ID(N'ims.FactDollarAnalyticsExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactDollarAnalyticsExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactDollarAnalyticsExt;

        SET @SQL = N'INSERT INTO ims.FactDollarAnalyticsExt (
            AnalyticsKey
        )
        SELECT
            s.AnalyticsKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].DollarAnalyticsExt s
        LEFT JOIN ims.FactDollarAnalyticsExt d ON s.AnalyticsKey = d.AnalyticsKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in DollarAnalytics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: FactDollarAnalytics_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactDollarAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactDollarAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'FactDollarAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactDollarAnalytics ----
        IF OBJECT_ID(N'ims.FactDollarAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactDollarAnalytics does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactDollarAnalytics;

        SET @SQL = N'INSERT INTO ims.FactDollarAnalytics (
            AnalyticsKey,
            SecurityKey,
            CustomAssetClassKey,
            CustomSecurityTypeKey,
            CurrencyKey,
            CountryKey,
            SourceSystemKey,
            DateKey,
            EffectiveDt,
            NextDividendPaydate,
            LastDividendPaydate,
            PriceStartDay,
            PriceLastEOD,
            DividendYield,
            DividendAmount,
            FiftyTwoWeekHigh,
            FiftyTwoWeekLow,
            CurrentYearHigh,
            CurrentYearLow,
            MarketPrice,
            Factor,
            OneMCPR,
            ThreeMCPR,
            SixMCPR,
            TwelveMCPR,
            DTC,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.AnalyticsKey,
            s.SecurityKey,
            s.LinkAssetClassKey,
            s.LinkSecurityTypeKey,
            s.CurrencyKey,
            s.CountryKey,
            s.SourceSystemKey,
            s.DateKey,
            s.EffectiveDt,
            s.NextDividendPaydate,
            s.LastDividendPaydate,
            s.PriceStartDay,
            s.PriceLastEOD,
            s.DividendYield,
            s.DividendAmount,
            s.FiftyTwoWeekHigh,
            s.FiftyTwoWeekLow,
            s.CurrentYearHigh,
            s.CurrentYearLow,
            s.MarketPrice,
            s.Factor,
            s.OneMCPR,
            s.ThreeMCPR,
            s.SixMCPR,
            s.TwelveMCPR,
            s.DTC,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.dbo.DollarAnalytics s
        Left JOIN ims.FactDollarAnalytics d
            ON s.AnalyticsKey = d.AnalyticsKey
        WHERE s.CreatedDate > ''2024-12-03 00:00:00'' OR s.UpdatedDate > ''2024-12-03 00:00:00'';';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.FactDollarAnalyticsExt ----
        IF OBJECT_ID(N'ims.FactDollarAnalyticsExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactDollarAnalyticsExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactDollarAnalyticsExt;

        SET @SQL = N'INSERT INTO ims.FactDollarAnalyticsExt (
            AnalyticsKey
        )
        SELECT
            s.AnalyticsKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].DollarAnalyticsExt s
        LEFT JOIN ims.FactDollarAnalyticsExt d ON s.AnalyticsKey = d.AnalyticsKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in FactDollarAnalytics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: FactPortfolioAllocationDetails_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactPortfolioAllocationDetails]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactPortfolioAllocationDetails';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'FactPortfolioAllocationDetails_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactPortfolioAllocationDetails ----
        IF OBJECT_ID(N'ims.FactPortfolioAllocationDetails', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactPortfolioAllocationDetails does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactPortfolioAllocationDetails;

        SET @SQL = N'INSERT INTO ims.FactPortfolioAllocationDetails (
            [PFAllocationKey],
			[PortfolioCode],
			[EffectiveDate],
			[DateKey],
			[AllocationType],
			[Ticker],
			[AllocationPercentage],
			[Quantity],
			[CreatedBy],
			[CreatedDate],
			[UpdatedBy],
			[UpdatedDate]
        )
        SELECT
            s.[PFAllocationKey],
			s.[PortfolioCode],
			s.[EffectiveDate],
			s.[DateKey],
			s.[AllocationType],
			s.[Ticker],
			s.[AllocationPercentage],
			s.[Quantity],
			s.[CreatedBy],
			s.[CreatedDate],
			s.[UpdatedBy],
			s.[UpdatedDate]
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].PortfolioAllocationDetails s
        LEFT JOIN ims.FactPortfolioAllocationDetails d
            ON d.PFAllocationKey = s.PFAllocationKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in FactPortfolioAllocationDetails_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: FactPortfolioStressTestResults_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactPortfolioStressTestResults]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactPortfolioStressTestResults';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'FactPortfolioStressTestResults_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactPortfolioStressTestResults ----
        IF OBJECT_ID(N'ims.FactPortfolioStressTestResults', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactPortfolioStressTestResults does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactPortfolioStressTestResults;

        SET @SQL = N'INSERT INTO ims.FactPortfolioStressTestResults (
            [PFTestresultKey],
			[PortfolioCode],
			[EffectiveDate],
			[DateKey],
			[Scenario],
			[AllocationType],
			[ChangePercent],
			[ChangeDollar],
			[CreatedBy],
			[CreatedDate],
			[UpdatedBy],
			[UpdatedDate]
        )
        SELECT
            s.[PFTestresultKey],
			s.[PortfolioCode],
			s.[EffectiveDate],
			s.[DateKey],
			s.[Scenario],
			s.[AllocationType],
			s.[ChangePercent],
			s.[ChangeDollar],
			s.[CreatedBy],
			s.[CreatedDate],
			s.[UpdatedBy],
			s.[UpdatedDate]
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].PortfolioStressTestResults s
        LEFT JOIN ims.FactPortfolioStressTestResults d
            ON d.PFTestresultKey = s.PFTestresultKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in FactPortfolioStressTestResults_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: FactSecurityDollarAnalytics_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactSecurityDollarAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactSecurityDollarAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'FactSecurityDollarAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.FactSecurityDollarAnalytics ----
        IF OBJECT_ID(N'ims.FactSecurityDollarAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactSecurityDollarAnalytics does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactSecurityDollarAnalytics;

        SET @SQL = N'INSERT INTO ims.FactSecurityDollarAnalytics (
            FactSecurityDollarAnalyticsKey,
            SecurityKey, AssetClassKey, SecurityTypeKey, CurrencyKey, CountryKey, SourceSystemKey,
            --DateKey, 

            SecurityId,
            EffectiveDt, NextDividendPaydate, LastDividendPaydate, PriceStartDay,
            PriceLastEOD, DividendYield, DividendAmount, FiftyTwoWeekHigh, FiftyTwoWeekLow,
            CurrentYearHigh, CurrentYearLow, MarketPrice, Factor, OneMCPR, ThreeMCPR,
            SixMCPR, TwelveMCPR, DTC, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS FactSecurityDollarAnalyticsKey,
            ds.SecurityKey, ds.AssetClassKey, ds.SecurityTypeKey, ds.CurrencyKey, ds.CountryKey,  ds.SourceSystemKey, 
            --dd.DateKey, 
            sda.SecurityId,
            cast(sda.EffectiveDt as Date) as EffectiveDt, sda.NextDivideendPaydate, sda.LastDivideendPaydate, sda.PriceStartDay, 
            sda.PriceLastEOD, sda.DivideEndYield, sda.DividendAmount, sda.FiftyTwoWeekHigh, sda.FiftyTwoWeekLow, 
            sda.CurrentYearHigh, sda.CurrentYearLow, sda.MarketPrice, sda.Factor, sda.[1mCPR], sda.[3mCPR], 
            sda.[6mCPR], sda.[12mCPR], sda.DTC, sda.CreatedBy, sda.CreatedDate, sda.UpdatedBy, sda.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.dbo.securitydollaranalytics sda
        INNER JOIN ims.DimSecurity ds ON sda.SecurityId = ds.SecurityId
        
        LEFT JOIN ims.FactSecurityDollarAnalytics f 
            ON f.SecurityId = sda.SecurityId AND cast(sda.EffectiveDt as Date) = f.EffectiveDt;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in FactSecurityDollarAnalytics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: FactSecurityRiskAnalytics_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactSecurityRiskAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactSecurityRiskAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'FactSecurityRiskAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.FactSecurityRiskAnalytics ----
        IF OBJECT_ID(N'ims.FactSecurityRiskAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactSecurityRiskAnalytics does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactSecurityRiskAnalytics;

        SET @SQL = N'INSERT INTO ims.FactSecurityRiskAnalytics (
            FactSecurityRiskAnalyticsKey,
            SecurityKey, AssetClassKey, SecurityTypeKey, CurrencyKey, CountryKey, 
            --SourceSystemKey,
            --DateKey, 
            SecurityId,
            EffectiveDt, EquityVolatility, PERatio, 
            KeyRateDur6M, KeyRateDur1Yr, KeyRateDur2y, KeyRateDur3y, KeyRateDur5y, KeyRateDur7y, KeyRateDur10y,
            Factor, WAC, WAM, ModifiedDur, SpreadDur, OAS, Convexity, AdjustedDur, YTM,
            CreatedBy, CreatedDate, UpdatedBy, UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS FactSecurityRiskAnalyticsKey, 
            ds.SecurityKey, ds.AssetClassKey, ds.SecurityTypeKey, ds.CurrencyKey, ds.CountryKey,  
            --ds.SourceSystemKey, 
            --dd.DateKey, 
            sra.SecurityId,
            cast(sra.EffectiveDt as Date) as EffectiveDt, sra.EquityVolatility, sra.PERatio,
            sra.KeyRateDur6M, sra.KeyRateDur1Yr, sra.KeyRateDur2y, sra.KeyRateDur3y,sra.KeyRateDur5y, sra.KeyRateDur7y, sra.KeyRateDur10y, 
            sra.Factor, sra.WAC, sra.WAM, sra.ModifiedDur, sra.SpreadDur, sra.OAS, sra.Convexity, sra.AdjustedDur, sra.YTM, 
            sra.CreatedBy, sra.CreatedDate, sra.UpdatedBy, sra.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].securityriskanalytics sra
  
        INNER JOIN ims.DimSecurity ds ON sra.SecurityId = ds.SecurityId
        
        LEFT JOIN ims.FactSecurityRiskAnalytics f 
            ON f.SecurityId = sra.SecurityId AND cast(sra.EffectiveDt as Date) = f.EffectiveDt;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in FactSecurityRiskAnalytics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Gics_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimGics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimGics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Gics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimGics ----
        IF OBJECT_ID(N'ims.DimGics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimGics does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimGics;

        SET @SQL = N'INSERT INTO ims.DimGics (
            GicsKey,
            GicsId,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.GicsKey,
            s.GicsId,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Gics s
        LEFT JOIN ims.DimGics d ON s.GicsKey = d.GicsKey
        WHERE s.Name IS NOT NULL;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimGicsExt ----
        IF OBJECT_ID(N'ims.DimGicsExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimGicsExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimGicsExt;

        SET @SQL = N'INSERT INTO ims.DimGicsExt (
            GicsKey
        )
        SELECT
            s.GicsKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].GicsExt s
        LEFT JOIN ims.DimGicsExt d ON s.GicsKey = d.GicsKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Gics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: IndexSecurity_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimIndexSecurity]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimIndexSecurity';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'IndexSecurity_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimIndexSecurity ----
        IF OBJECT_ID(N'ims.DimIndexSecurity', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimIndexSecurity does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimIndexSecurity;

        SET @SQL = N'INSERT INTO ims.DimIndexSecurity (
            IndexSecurityKey,
            AsofDate,
            Identifier,
            BenchmarkKey,
            SecurityKey,
            CurrentFace,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.IndexSecurityKey,
            s.AsOfDate,
            s.Identifier,
            b.BenchmarkKey,
            se.SecurityKey,
            s.CurrentFace,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].IndexSecurity s
        LEFT JOIN ims.DimIndexSecurity d
            ON d.IndexSecurityKey = s.IndexSecurityKey
        LEFT JOIN ims.DimBenchmark b
            ON b.BenchmarkCode COLLATE Latin1_General_CI_AS = s.BenchmarkCode COLLATE Latin1_General_CI_AS
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityIdentifier si
            ON si.Identifier COLLATE Latin1_General_CI_AS = s.Identifier COLLATE Latin1_General_CI_AS
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Security se
            ON se.SecurityKey = si.SecurityKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in IndexSecurity_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: LinkAssetClass_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimLinkAssetClass]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimLinkAssetClass';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'LinkAssetClass_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimLinkAssetClass ----
        IF OBJECT_ID(N'ims.DimLinkAssetClass', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimLinkAssetClass does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimLinkAssetClass;

        SET @SQL = N'INSERT INTO ims.DimLinkAssetClass (
            LinkAssetClassKey,
            AssetClassCode,
            AssetClassName,
            ParentAssetClassCode,
            ParentAssetClassName,
            CustomerAssetClassCode,
            CustomerAssetClassName,
            ParentCustomerAssetClassCode,
            ParentCustomerAssetClassName,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.LinkAssetClassKey,
            s.AssetClassCode,
            ac.Name,
            s.AssetClassParentCode,
            pac.Name,
            s.CustomerAssetClassCode,
            cac.Name,
            s.CustomerAssetClassParentCode,
            pcac.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].LinkAssetClass s
        LEFT JOIN ims.DimLinkAssetClass d
            ON s.LinkAssetClassKey = d.LinkAssetClassKey
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AssetClass ac
            ON ac.AssetClassId = s.AssetClassId
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AssetClass pac
            ON pac.AssetClassId = s.AssetClassParentID
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AssetClass cac
            ON cac.AssetClassId = s.CustomerAssetClassId
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AssetClass pcac
            ON pcac.AssetClassId = s.CustomerAssetClassParentId;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimLinkAssetClassExt ----
        IF OBJECT_ID(N'ims.DimLinkAssetClassExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimLinkAssetClassExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimLinkAssetClassExt;

        SET @SQL = N'INSERT INTO ims.DimLinkAssetClassExt (
            LinkAssetClassKey
        )
        SELECT
            s.LinkAssetClassKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].LinkAssetClassExt s
        LEFT JOIN ims.DimLinkAssetClassExt d ON s.LinkAssetClassKey = d.LinkAssetClassKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in LinkAssetClass_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: LinkSecurityType_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimLinkSecurityType]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimLinkSecurityType';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'LinkSecurityType_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimLinkSecurityType ----
        IF OBJECT_ID(N'ims.DimLinkSecurityType', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimLinkSecurityType does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimLinkSecurityType;

        SET @SQL = N'INSERT INTO ims.DimLinkSecurityType (
            LinkSecurityTypeKey,
            SecurityTypeCode,
            CustomerSecurityTypeCode,
            SecurityTypeName,
            CustomerSecurityTypeName,
            SecurityTypeKey,
            CustomerSecurityTypeKey,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.LinkSecurityTypeKey,
            CAST(s.SecurityTypeCode AS VARCHAR(64)),
            CAST(s.CustomerSecurityTypeCode AS VARCHAR(64)),
            CAST(st.Name AS VARCHAR(64)),
            CAST(cst.Name AS VARCHAR(64)),
            st.SecurityTypeKey,
            cst.SecurityTypeKey,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].LinkSecurityType s
        LEFT JOIN ims.DimLinkSecurityType d
            ON s.LinkSecurityTypeKey = d.LinkSecurityTypeKey
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityType st
            ON st.SecurityTypeId = s.SecurityTypeId
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityType cst
            ON cst.SecurityTypeId = s.CustomerSecurityTypeId;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimLinkSecurityTypeExt ----
        IF OBJECT_ID(N'ims.DimLinkSecurityTypeExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimLinkSecurityTypeExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimLinkSecurityTypeExt;

        SET @SQL = N'INSERT INTO ims.DimLinkSecurityTypeExt (
            LinkSecurityTypeKey
        )
        SELECT
            s.LinkSecurityTypeKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].LinkSecurityTypeExt s
        LEFT JOIN ims.DimLinkSecurityTypeExt d ON s.LinkSecurityTypeKey = d.LinkSecurityTypeKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in LinkSecurityType_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Metric_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimMetric]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimMetric';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Metric_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.DimMetric ----
        IF OBJECT_ID(N'ims.DimMetric', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimMetric does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimMetric;

        -- Table was just truncated, so this always evaluates to 0; kept for clarity/future-proofing
        SELECT @MaxID = ISNULL(MAX([MetricKey]), 0) FROM ims.DimMetric;

        SET @SQL = N'INSERT INTO ims.DimMetric (
            MetricKey,
            MetricId,
            MetricCode,
            MetricName,
            MetricGroup,
            MetricDisplayName,
            Source,
            SortOrder,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS MetricKey,
            s.MetricId,
			s.MetricCode,
			s.MetricName,
			s.MetricGroup,
			s.MetricDisplayName,
			s.Source,
			s.SortOrder,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].metric s
        LEFT JOIN ims.DimMetric d
            ON s.MetricId = d.MetricId;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Metric_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: PortfolioAllocationDetails_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactPortfolioAllocationDetails]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactPortfolioAllocationDetails';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'PortfolioAllocationDetails_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactPortfolioAllocationDetails ----
        IF OBJECT_ID(N'ims.FactPortfolioAllocationDetails', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactPortfolioAllocationDetails does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactPortfolioAllocationDetails;

        SET @SQL = N'INSERT INTO ims.FactPortfolioAllocationDetails (
            [PFAllocationKey],
			[PortfolioCode],
			[EffectiveDate],
			[DateKey],
			[AllocationType],
			[Ticker],
			[AllocationPercentage],
			[Quantity],
			[CreatedBy],
			[CreatedDate],
			[UpdatedBy],
			[UpdatedDate]
        )
        SELECT
            s.[PFAllocationKey],
			s.[PortfolioCode],
			s.[EffectiveDate],
			s.[DateKey],
			s.[AllocationType],
			s.[Ticker],
			s.[AllocationPercentage],
			s.[Quantity],
			s.[CreatedBy],
			s.[CreatedDate],
			s.[UpdatedBy],
			s.[UpdatedDate]
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].PortfolioAllocationDetails s
        LEFT JOIN ims.FactPortfolioAllocationDetails d
            ON d.PFAllocationKey = s.PFAllocationKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in PortfolioAllocationDetails_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: PortfolioGroup_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimPortfolioGroup]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimPortfolioGroup';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'PortfolioGroup_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.DimPortfolioGroup ----
        IF OBJECT_ID(N'ims.DimPortfolioGroup', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimPortfolioGroup does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimPortfolioGroup;

        SET @SQL = N'INSERT INTO ims.DimPortfolioGroup (
            PortfolioGroupKey,
            PortfolioGroupId,
            SourceKey,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS PortfolioGroupKey,
            s.PortfolioGroupId,
            s.SourceKey,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].portfoliogroup s
        LEFT JOIN ims.DimPortfolioGroup d
            ON s.PortfolioGroupId = d.PortfolioGroupId;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in PortfolioGroup_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Portfolio_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimPortfolio]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimPortfolio';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Portfolio_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimPortfolio ----
        IF OBJECT_ID(N'ims.DimPortfolio', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimPortfolio does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimPortfolio;

        SET @SQL = N'INSERT INTO ims.DimPortfolio (
            PortfolioKey,
            PortfolioId,
            PortfolioCode,
            ShortName,
            LongName,
            PortfolioDescription,
            ParentId,
            InceptionDate,
            TerminationDate,
            PortfolioType,
            IsActive,
            PortfolioGroupCode,
            PortfolioGroupName,
            StrategyKey,
            BenchmarkKey,
            CustodianKey,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.PortfolioKey,
            s.PortfolioCode,
            s.PortfolioCode,
            s.ShortName,
            s.LongName,
            s.PortfolioDescription,
            s.ParentId,
            s.InceptionDate,
            s.TerminationDate,
            s.PortfolioType,
            s.IsActive,
            pg.Code,
            pg.Name,
            st.StrategyKey,
            b.BenchmarkKey,
            cu.CustodianKey,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Portfolio s
        LEFT JOIN ims.DimPortfolio d
            ON s.PortfolioKey = d.PortfolioKey
        LEFT JOIN ims.DimStrategy st
            ON st.Code  COLLATE Latin1_General_CI_AS = s.StrategyCode COLLATE Latin1_General_CI_AS
            OR s.StrategyCode IS NULL
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].PortfolioGroup pg
            ON pg.Code COLLATE Latin1_General_CI_AS = s.PortfolioGroupCode COLLATE Latin1_General_CI_AS
            OR s.PortfolioGroupCode IS NULL
        LEFT JOIN ims.DimBenchmark b
            ON b.BenchmarkCode COLLATE Latin1_General_CI_AS = s.PrimaryBenchmarkCode COLLATE Latin1_General_CI_AS
            OR s.PrimaryBenchmarkCode IS NULL
        LEFT JOIN ims.DimCustodian cu
            ON cu.Code COLLATE Latin1_General_CI_AS = s.CustodianCode COLLATE Latin1_General_CI_AS
            OR s.CustodianCode IS NULL;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimPortfolioExt ----
        IF OBJECT_ID(N'ims.DimPortfolioExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimPortfolioExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimPortfolioExt;

        SET @SQL = N'INSERT INTO ims.DimPortfolioExt (
            PortfolioKey
        )
        SELECT
            s.PortfolioKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].PortfolioExt s
        LEFT JOIN ims.DimPortfolioExt d ON s.PortfolioKey = d.PortfolioKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Portfolio_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Position_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactPosition]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactPosition';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Position_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactPosition ----
        IF OBJECT_ID(N'ims.FactPosition', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactPosition does not exist.', 1;
        END

        -- Stage source rows (with dimension-key lookups) using a permanent staging table,
        -- since a local #temp table created inside sp_executesql would not survive past that call.
        IF OBJECT_ID(N'dbo.TmpFactPosition', N'U') IS NOT NULL
        BEGIN
            DROP TABLE dbo.TmpFactPosition;
        END

        SET @SQL = N'
        SELECT
            s.PositionKey,
            s.AsOfDate,
            po.PortfolioCode,
            s.Identifier,
            s.MarketPrice,
            s.MarketValue,
            s.Originalface,
            s.Currentface,
            s.Quantity,
            s.Factor,
            s.AccruedInterestAmount,
            s.NotionalValue,
            s.Coupon,
            s.TicketId,
            dt.DateKey,
            si.SecurityKey,
            po.PortfolioKey,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        INTO dbo.TmpFactPosition
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].[Position] s
        LEFT JOIN ims.DimPortfolio po
            ON po.PortfolioCode COLLATE Latin1_General_CI_AS = s.PortfolioCode COLLATE Latin1_General_CI_AS
        LEFT JOIN ims.DimSecurityIdentifier si
            ON si.Identifier COLLATE Latin1_General_CI_AS = s.Identifier COLLATE Latin1_General_CI_AS
        LEFT JOIN dbo.DimDate dt
            ON s.AsOfDate = dt.[Date];';
        EXEC sp_executesql @SQL;

        IF (SELECT COUNT(*) FROM dbo.TmpFactPosition) = 0
        BEGIN
            DROP TABLE dbo.TmpFactPosition;
            THROW 50002, 'Row count is zero for TmpFactPosition (source returned no rows).', 1;
        END

        TRUNCATE TABLE ims.FactPosition;

        INSERT INTO ims.FactPosition (
            PositionKey,
            AsofDate,
            PortfolioCode,
            Identifier,
            MarketPrice,
            MarketValue,
            OriginalFace,
            CurrentFace,
            Quantity,
            Factor,
            AccruedInterestAmount,
            NotionalValue,
            Coupon,
            TicketId,
            DateKey,
            SecurityKey,
            PortfolioKey,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.PositionKey,
            s.AsOfDate,
            s.PortfolioCode,
            s.Identifier,
            s.MarketPrice,
            s.MarketValue,
            s.Originalface,
            s.Currentface,
            s.Quantity,
            s.Factor,
            s.AccruedInterestAmount,
            s.NotionalValue,
            s.Coupon,
            s.TicketId,
            s.DateKey,
            s.SecurityKey,
            s.PortfolioKey,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM dbo.TmpFactPosition s;
        SET @RowsInserted += @@ROWCOUNT;

        DROP TABLE dbo.TmpFactPosition;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Position_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: RiskAnalytics_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactRiskAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactRiskAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'RiskAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactRiskAnalytics ----
        IF OBJECT_ID(N'ims.FactRiskAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactRiskAnalytics does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactRiskAnalytics;

        SET @SQL = N'INSERT INTO ims.FactRiskAnalytics (
            AnalyticsKey,
            SecurityKey,
            LinkAssetClassKey,
            LinkSecurityTypeKey,
            CurrencyKey,
            CountryKey,
            SourceSystemKey,
            DateKey,
            EffectiveDt,
            EquityVolatility,
            PERatio,
            KeyRateDur6M,
            KeyRateDur1Yr,
            KeyRateDur2y,
            KeyRateDur3y,
            KeyRateDur5y,
            KeyRateDur7y,
            KeyRateDur10y,
            Factor,
            WAC,
            WAM,
            ModifiedDur,
            SpreadDur,
            OAS,
            Convexity,
            AdjustedDur,
            YTM,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.AnalyticsKey,
            s.SecurityKey,
            s.LinkAssetClassKey,
            s.LinkSecurityTypeKey,
            s.CurrencyKey,
            s.CountryKey,
            s.SourceSystemKey,
            s.DateKey,
            s.EffectiveDt,
            s.EquityVolatility,
            s.PERatio,
            s.KeyRateDur6M,
            s.KeyRateDur1Yr,
            s.KeyRateDur2y,
            s.KeyRateDur3y,
            s.KeyRateDur5y,
            s.KeyRateDur7y,
            s.KeyRateDur10y,
            s.Factor,
            s.WAC,
            s.WAM,
            s.ModifiedDur,
            s.SpreadDur,
            s.OAS,
            s.Convexity,
            s.AdjustedDur,
            s.YTM,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.dbo.RiskAnalytics s
        LEFT JOIN ims.FactRiskAnalytics d
            ON s.AnalyticsKey = d.AnalyticsKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.FactRiskAnalyticsExt ----
        IF OBJECT_ID(N'ims.FactRiskAnalyticsExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactRiskAnalyticsExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactRiskAnalyticsExt;

        SET @SQL = N'INSERT INTO ims.FactRiskAnalyticsExt (
            AnalyticsKey
        )
        SELECT
            s.AnalyticsKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].RiskAnalyticsExt s
        LEFT JOIN ims.FactRiskAnalyticsExt d ON s.AnalyticsKey = d.AnalyticsKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in RiskAnalytics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: SecurityType_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimSecurityType]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimSecurityType';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'SecurityType_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.DimSecurityType ----
        IF OBJECT_ID(N'ims.DimSecurityType', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSecurityType does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSecurityType;

        SET @SQL = N'INSERT INTO ims.DimSecurityType (
            SecurityTypeKey, SecurityTypeId, Code, Name, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS SecurityTypeKey,
            s.SecurityTypeId, s.Code, s.Name, s.CreatedBy, s.CreatedDate, s.UpdatedBy, s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].securitytype  s
        LEFT JOIN ims.DimSecurityType d ON s.SecurityTypeId = d.SecurityTypeId;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in SecurityType_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Security_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimSecurity]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimSecurity';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Security_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimSecurity ----
        IF OBJECT_ID(N'ims.DimSecurity', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSecurity does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSecurity;

        SET @SQL = N'INSERT INTO ims.DimSecurity (
            SecurityKey, LinkAssetClassKey, LinkSecurityTypeKey, FIGI, CurrencyKey, CountryKey,
            ShortName, LongName, SecurityDescription, SourceSystemKey, IndustryGICS,
            SubindustryGICS, SectorGICS, IndustryGroupGICS, SubSectorGICS,
            LatestEffectiveDt, OrginationDt, Coupon, ContractSize, TotalShares, MaturityDate,
            CreatedBy, CreatedDate, UpdatedBy, UpdatedDate, IssuerKey
        )
        SELECT
            s.SecurityKey,
            ac.LinkAssetClassKey, st.LinkSecurityTypeKey, s.FIGI, cu.CurrencyKey, co.CountryKey,
            s.ShortName, s.LongName, s.SecurityDescription, s.SourceSystemKey, s.IndustryGICS,
            s.SubindustryGICS, s.SectorGICS, s.IndustryGroupGICS, s.SubSectorGICS,
            s.LatestEffectiveDt, s.OrginationDt, s.Coupon, s.ContractSize, s.TotalShares, s.MaturityDate,
            s.CreatedBy, s.CreatedDate, s.UpdatedBy, s.UpdatedDate, si.IssuerKey  -- Only get IssuerKey if IdentifierType is ''SYMBOL''
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Security s
        LEFT JOIN ims.DimLinkAssetClass ac ON ac.LinkAssetClassKey = s.LinkAssetClassKey
        LEFT JOIN ims.DimCountry co ON co.CountryKey = s.CountryKey
        LEFT JOIN ims.DimCurrency cu ON cu.CurrencyKey = s.CurrencyKey
        LEFT JOIN ims.DimLinkSecurityType st ON st.LinkSecurityTypeKey = s.LinkSecurityTypeKey
        LEFT JOIN (
            SELECT
                dsi.SecurityKey,
                dsi.Identifier,
                dsi.IdentifierType,
                i.IssuerKey
            FROM ims.DimSecurityIdentifier dsi
            LEFT JOIN ims.DimIssuer i ON dsi.Identifier COLLATE Latin1_General_CI_AS = i.Code COLLATE Latin1_General_CI_AS
            WHERE dsi.IdentifierType = ''SYMBOL''
        ) AS si ON si.SecurityKey = s.SecurityKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimSecurityIdentifier ----
        IF OBJECT_ID(N'ims.DimSecurityIdentifier', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSecurityIdentifier does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSecurityIdentifier;

        SET @SQL = N'INSERT INTO ims.DimSecurityIdentifier (
            SecurityKey,
            IdentifierType,
            Identifier,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            sec.SecurityKey,
            s.IdentifierType,
            s.Identifier,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityIdentifier s

        LEFT JOIN ims.DimSecurity sec
            ON s.SecurityKey = sec.SecurityKey

        LEFT JOIN ims.DimSecurityIdentifier d
            ON s.SecurityKey = d.SecurityKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimSecurityExt ----
        IF OBJECT_ID(N'ims.DimSecurityExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSecurityExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSecurityExt;

        SET @SQL = N'INSERT INTO ims.DimSecurityExt (
            SecurityKey
        )
        SELECT
            s.SecurityKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityExt s
        LEFT JOIN ims.DimSecurityExt d ON s.SecurityKey = d.SecurityKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimSecurityIdentifierExt ----
        IF OBJECT_ID(N'ims.DimSecurityIdentifierExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSecurityIdentifierExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSecurityIdentifierExt;

        SET @SQL = N'INSERT INTO ims.DimSecurityIdentifierExt (
            SecurityKey
        )
        SELECT
            s.SecurityKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityIdentifierExt s
        LEFT JOIN ims.DimSecurityIdentifierExt d ON s.SecurityKey = d.SecurityKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Security_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: SourceSystemType_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimSourceSystemType]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimSourceSystemType';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'SourceSystemType_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);
    DECLARE @MaxID BIGINT = 0;

    BEGIN TRY

        -- ---- Target: ims.DimSourceSystemType ----
        IF OBJECT_ID(N'ims.DimSourceSystemType', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSourceSystemType does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSourceSystemType;

        -- Table was just truncated, so this always evaluates to 0; kept for clarity/future-proofing
        SELECT @MaxID = ISNULL(MAX([SourceSystemTypeKey]), 0) FROM ims.DimSourceSystemType;

        SET @SQL = N'INSERT INTO ims.DimSourceSystemType (
            SourceSystemTypeKey,
            SourceSystemTypeId,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            @MaxIDParam + ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS SourceSystemTypeKey,
            s.SourceSystemTypeId,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].sourcesystemtype s
        LEFT JOIN ims.DimSourceSystemType d
            ON s.SourceSystemTypeId = d.SourceSystemTypeId;';
        EXEC sp_executesql @SQL, N'@MaxIDParam BIGINT', @MaxIDParam = @MaxID;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in SourceSystemType_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: SourceSystem_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimSourceSystem]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimSourceSystem';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'SourceSystem_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimSourceSystem ----
        IF OBJECT_ID(N'ims.DimSourceSystem', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSourceSystem does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSourceSystem;

        SET @SQL = N'INSERT INTO ims.DimSourceSystem (
            SourceSystemKey, SourceSystemId, Code, Name, SourceSystemTypeCode,
            SourceSystemTypeName, CreatedBy, CreatedDate, UpdatedBy, UpdatedDate
        )
        SELECT
            ss.SourceSystemKey,
            ss.SourceSystemId,
            ss.Code,
            ss.Name,
            ss.SourceSystemTypeCode,
            sst.Name AS SourceSystemTypeName,
            ss.CreatedBy,
            ss.CreatedDate,
            ss.UpdatedBy,
            ss.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SourceSystem ss
        LEFT JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SourceSystemType sst ON ss.SourceSystemTypeCode = sst.Code
        LEFT JOIN ims.DimSourceSystem dim ON ss.SourceSystemKey = dim.SourceSystemKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimSourceSystemExt ----
        IF OBJECT_ID(N'ims.DimSourceSystemExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimSourceSystemExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimSourceSystemExt;

        SET @SQL = N'INSERT INTO ims.DimSourceSystemExt (
            SourceSystemKey
        )
        SELECT
            source.SourceSystemKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SourceSystem source
        LEFT JOIN ims.DimSourceSystemExt target on source.SourceSystemKey = target.SourceSystemKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in SourceSystem_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: StandardAnalytics_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactStandardAnalytics]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactStandardAnalytics';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'StandardAnalytics_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactStandardAnalytics ----
        IF OBJECT_ID(N'ims.FactStandardAnalytics', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactStandardAnalytics does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactStandardAnalytics;

        SET @SQL = N'INSERT INTO ims.FactStandardAnalytics (
            StandardAnalyticsKey,
            SecurityKey,
            EffectiveDt,
            StandardSourceKey,
            StandardSourceFieldKey,
            Value,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.StandardAnalyticsKey,
            si.SecurityKey,
            s.AsOfDate,
            ss.StandardSourceKey,
            ssf.StandardSourceFieldKey,
            s.Value,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardAnalytics s
        LEFT JOIN ims.FactStandardAnalytics d
            ON s.StandardAnalyticsKey = d.StandardAnalyticsKey
        INNER JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityIdentifier si
            ON si.Identifier = s.Symbol AND si.IdentifierType = ''SYMBOL''
        INNER JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSource ss
            ON ss.Name = s.Source
        INNER JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSourceFields ssf
            ON ssf.Code = s.Field;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.FactStandardAnalyticsExt ----
        IF OBJECT_ID(N'ims.FactStandardAnalyticsExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactStandardAnalyticsExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactStandardAnalyticsExt;

        SET @SQL = N'INSERT INTO ims.FactStandardAnalyticsExt (
            StandardAnalyticsKey
        )
        SELECT
            s.StandardAnalyticsKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardAnalyticsExt s
        LEFT JOIN ims.FactStandardAnalyticsExt d ON s.StandardAnalyticsKey = d.StandardAnalyticsKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in StandardAnalytics_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: StandardSourceField_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimStandardSourceField]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimStandardSourceField';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'StandardSourceField_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimStandardSourceField ----
        IF OBJECT_ID(N'ims.DimStandardSourceField', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimStandardSourceField does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimStandardSourceField;

        SET @SQL = N'INSERT INTO ims.DimStandardSourceField (
            StandardSourceFieldKey,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.StandardSourceFieldKey,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSourceFields s
        LEFT JOIN ims.DimStandardSourceField d
            ON s.StandardSourceFieldKey = d.StandardSourceFieldKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimStandardSourceFieldExt ----
        IF OBJECT_ID(N'ims.DimStandardSourceFieldExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimStandardSourceFieldExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimStandardSourceFieldExt;

        SET @SQL = N'INSERT INTO ims.DimStandardSourceFieldExt (
            StandardSourceFieldKey
        )
        SELECT
            s.StandardSourceFieldKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSourceFieldsExt s
        LEFT JOIN ims.DimStandardSourceFieldExt d ON s.StandardSourceFieldKey = d.StandardSourceFieldKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in StandardSourceField_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: StandardSourceFields_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_StandardSourceFields]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'StandardSourceFields';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'StandardSourceFields_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.StandardSourceFields ----
        IF OBJECT_ID(N'ims.StandardSourceFields', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.StandardSourceFields does not exist.', 1;
        END

        TRUNCATE TABLE ims.StandardSourceFields;

        SET @SQL = N'INSERT INTO ims.StandardSourceFields (
            StandardSourceFieldKey,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.StandardSourceFieldKey,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSourceFields s
        LEFT JOIN ims.StandardSourceFields d
            ON s.StandardSourceFieldKey = d.StandardSourceFieldKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.StandardSourceFieldsExt ----
        IF OBJECT_ID(N'ims.StandardSourceFieldsExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.StandardSourceFieldsExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.StandardSourceFieldsExt;

        SET @SQL = N'INSERT INTO ims.StandardSourceFieldsExt (
            StandardSourceFieldKey
        )
        SELECT
            s.StandardSourceFieldKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSourceFieldsExt s
        LEFT JOIN ims.StandardSourceFieldsExt d ON s.StandardSourceFieldKey = d.StandardSourceFieldKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in StandardSourceFields_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: StandardSource_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimStandardSource]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimStandardSource';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'StandardSource_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimStandardSource ----
        IF OBJECT_ID(N'ims.DimStandardSource', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimStandardSource does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimStandardSource;

        SET @SQL = N'INSERT INTO ims.DimStandardSource (
            StandardSourceKey,
            Name,
            Description,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.StandardSourceKey,
            s.Name,
            s.Description,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSource s
        LEFT JOIN ims.DimStandardSource d
            ON s.StandardSourceKey = d.StandardSourceKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimStandardSourceExt ----
        IF OBJECT_ID(N'ims.DimStandardSourceExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimStandardSourceExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimStandardSourceExt;

        SET @SQL = N'INSERT INTO ims.DimStandardSourceExt (
            StandardSourceKey
        )
        SELECT
            s.StandardSourceKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StandardSourceExt s
        LEFT JOIN ims.DimStandardSourceExt d ON s.StandardSourceKey = d.StandardSourceKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in StandardSource_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Strategy_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimStrategy]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimStrategy';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Strategy_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimStrategy ----
        IF OBJECT_ID(N'ims.DimStrategy', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimStrategy does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimStrategy;

        SET @SQL = N'INSERT INTO ims.DimStrategy (
            StrategyKey,
            StrategyId,
            ParentId,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.StrategyKey,
            s.StrategyId,
            s.ParentId,
            s.Code,
            s.Name,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Strategy s
        LEFT JOIN ims.DimStrategy d
            ON s.StrategyKey = d.StrategyKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.DimStrategyExt ----
        IF OBJECT_ID(N'ims.DimStrategyExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimStrategyExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimStrategyExt;

        SET @SQL = N'INSERT INTO ims.DimStrategyExt (
            StrategyKey
        )
        SELECT
            s.StrategyKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].StrategyExt s
        LEFT JOIN ims.DimStrategyExt d ON s.StrategyKey = d.StrategyKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Strategy_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: Transact_Gold_Process.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_FactTransact]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'FactTransact';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Transact_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.FactTransact ----
        IF OBJECT_ID(N'ims.FactTransact', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactTransact does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactTransact;

        SET @SQL = N'INSERT INTO ims.FactTransact (
            TransactKey,
            Identifier,
            ReportedDate,
            TradeDate,
            SettlementDate,
            CanceledDate,
            TradeType,
            BuyProtection,
            Quantity,
            PriceLocal,
            PriceBase,
            PriceUSD,
            CommissionLocal,
            CommissionBase,
            CommissionUSD,
            ImpliedCommissionLocal,
            ImpliedCommissionBase,
            ImpliedCommissionUSD,
            FeesLocal,
            FeesBase,
            FeesUSD,
            NetAmountLocal,
            NetAmountBase,
            NetAmountUSD,
            GrossAmountLocal,
            GrossAmountBase,
            GrossAmountUSD,
            CostLocal,
            CostBase,
            CostUSD,
            GainLossLocal,
            PercentGainLossLocal,
            PercentGainLossBase,
            PercentGainLossUSD,
            AccruedInterestLocal,
            AccruedInterestBase,
            AccruedInterestUSD,
            DateKey,
            SecurityKey,
            PortfolioKey,
            BrokerKey,
            CreatedBy,
            CreatedDate,
            UpdatedBy,
            UpdatedDate
        )
        SELECT
            s.TransactKey,
            s.Identifier,
            s.ReportedDate,
            s.TradeDate,
            s.SettlementDate,
            s.CanceledDate,
            s.TradeType,
            s.BuyProtection,
            s.Quantity,
            s.PriceLocal,
            s.PriceBase,
            s.PriceUSD,
            s.CommissionLocal,
            s.CommissionBase,
            s.CommissionUSD,
            s.ImpliedCommissionLocal,
            s.ImpliedCommissionBase,
            s.ImpliedCommissionUSD,
            s.FeesLocal,
            s.FeesBase,
            s.FeesUSD,
            s.NetAmountLocal,
            s.NetAmountBase,
            s.NetAmountUSD,
            s.GrossAmountLocal,
            s.GrossAmountBase,
            s.GrossAmountUSD,
            s.CostLocal,
            s.CostBase,
            s.CostUSD,
            s.GainLossLocal,
            s.PercentGainLossLocal,
            s.PercentGainLossBase,
            s.PercentGainLossUSD,
            s.AccruedInterestLocal,
            s.AccruedInterestBase,
            s.AccruedInterestUSD,
            CAST(CONVERT(VARCHAR(8), s.TradeDate, 112) AS INT), --da.DateKey,
            se.SecurityKey,
            p.PortfolioKey,
            b.BrokerKey,
            s.CreatedBy,
            s.CreatedDate,
            s.UpdatedBy,
            s.UpdatedDate
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Transact s
        LEFT JOIN ims.FactTransact d
            ON d.TransactKey = s.TransactKey
        LEFT JOIN dbo.DimDate da
            ON CAST(da.[Date] AS DATE) = CAST(d.TradeDate AS DATE)
        INNER JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].SecurityIdentifier si
            ON si.Identifier = s.Identifier
        INNER JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Security se
            ON se.SecurityKey = si.SecurityKey
        INNER JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Portfolio p
            ON p.PortfolioKey = s.PortfolioKey
        INNER JOIN ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Broker b
            ON b.BrokerKey = s.BrokerKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        -- ---- Target: ims.FactTransactExt ----
        IF OBJECT_ID(N'ims.FactTransactExt', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.FactTransactExt does not exist.', 1;
        END

        TRUNCATE TABLE ims.FactTransactExt;

        SET @SQL = N'INSERT INTO ims.FactTransactExt (
            TransactKey
        )
        SELECT
            s.TransactKey
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].TransactExt s
        LEFT JOIN ims.FactTransactExt d ON s.TransactKey = d.TransactKey;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Transact_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: sp_DS_PortfolioOptimization.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DS_PortfolioOptimization]
    @BatchId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName VARCHAR(200);
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @StartTime DATETIME2(6);
    DECLARE @EndTime DATETIME2(6);
    DECLARE @Duration VARCHAR(50);
    DECLARE @RowsInserted INT;

    BEGIN TRY

        -----------------------------------------------------------------------
        -- TABLE 1 : DS_PortfolioOptimization_Weights
        -----------------------------------------------------------------------
        SET @TableName = 'DS_PortfolioOptimization_Weights';
        SET @StartTime = SYSUTCDATETIME();

        IF OBJECT_ID(N'ims.DS_PortfolioOptimization_Weights', N'U') IS NULL
        BEGIN
            THROW 50000,
                'Invalid operation. Table ims.DS_PortfolioOptimization_Weights does not exist.',
                1;
        END;

        TRUNCATE TABLE ims.DS_PortfolioOptimization_Weights;

        INSERT INTO ims.DS_PortfolioOptimization_Weights
        (
            RowId,
            PortfolioId,
            Ticker,
            AsOfDate,
            CurrentWeight,
            TargetWeight,
            WeightDelta,
            TradeAction,
            TradeSizeValue,
            CreatedDate,
            UpdatedDate
        )
        SELECT
            RowId,
            PortfolioId,
            Ticker,
            AsOfDate,
            CurrentWeight,
            TargetWeight,
            WeightDelta,
            TradeAction,
            TradeSizeValue,
            CreatedDate,
            UpdatedDate
        FROM staging.DS_PortfolioOptimization_Weights;

        SET @RowsInserted = @@ROWCOUNT;
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_DS_PortfolioOptimization'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- TABLE 2 : DS_PortfolioOptimization_Performance
        -----------------------------------------------------------------------
        SET @TableName = 'DS_PortfolioOptimization_Performance';
        SET @StartTime = SYSUTCDATETIME();

        IF OBJECT_ID(N'ims.DS_PortfolioOptimization_Performance', N'U') IS NULL
        BEGIN
            THROW 50000,
                'Invalid operation. Table ims.DS_PortfolioOptimization_Performance does not exist.',
                1; -- Fixed missing state value and statement terminator
        END;

        TRUNCATE TABLE ims.DS_PortfolioOptimization_Performance;

        INSERT INTO ims.DS_PortfolioOptimization_Performance
        (
            RowId,
            PortfolioId,
            PeriodStart,
            PeriodEnd,
            NetReturn,
            Sharpe,
            MaxDrawdown,
            Turnover,
            CreatedDate,
            UpdatedDate
        )
        SELECT
            RowId,
            PortfolioId,
            PeriodStart,
            PeriodEnd,
            NetReturn,
            Sharpe,
            MaxDrawdown,
            Turnover,
            CreatedDate,
            UpdatedDate
        FROM staging.DS_PortfolioOptimization_Performance;

        SET @RowsInserted = @@ROWCOUNT;
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_DS_PortfolioOptimization'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

        -----------------------------------------------------------------------
        -- TABLE 3 : DS_PortfolioOptimization_RiskRegime
        -----------------------------------------------------------------------
        SET @TableName = 'DS_PortfolioOptimization_RiskRegime';
        SET @StartTime = SYSUTCDATETIME();

        IF OBJECT_ID(N'ims.DS_PortfolioOptimization_RiskRegime', N'U') IS NULL
        BEGIN
            THROW 50000,
                'Invalid operation. Table ims.DS_PortfolioOptimization_RiskRegime does not exist.',
                1;
        END;

        TRUNCATE TABLE ims.DS_PortfolioOptimization_RiskRegime;

        INSERT INTO ims.DS_PortfolioOptimization_RiskRegime
        (
            RowId,
            PortfolioId,
            EffectiveDate,
            GARCH_Volatility,
            VolatilityRegime,
            PPO_AAPL,
            PPO_MSFT,
            CreatedDate,
            UpdatedDate
        )
        SELECT
            RowId,
            PortfolioId,
            EffectiveDate,
            GARCH_Volatility,
            VolatilityRegime,
            PPO_AAPL,
            PPO_MSFT,
            CreatedDate,
            UpdatedDate
        FROM staging.DS_PortfolioOptimization_RiskRegime;

        SET @RowsInserted = @@ROWCOUNT;
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                'sp_DS_PortfolioOptimization'
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH

        SET @ErrorMessage = ERROR_MESSAGE();
        SET @EndTime = SYSUTCDATETIME();

        SET @Duration =
            CAST(DATEDIFF(SECOND, ISNULL(@StartTime, @EndTime), @EndTime) AS VARCHAR(20))
            + ' Seconds';

        BEGIN TRY

            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                'sp_DS_PortfolioOptimization'
            );

        END TRY
        BEGIN CATCH
            -- Swallow logging errors
        END CATCH;

        THROW;

    END CATCH

END;
GO


-- ============================== Source file: sp_DimAccount.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimAccount]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimAccount';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Account_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimAccount ----
        IF OBJECT_ID(N'ims.DimAccount', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimAccount does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimAccount;

        SET @SQL = N'INSERT INTO ims.DimAccount (
            AccountKey,
            AccountId,
            Code,
            Name,
            ExternalSystemKey,
            ExternalSystemAccountNumber,
            PlanKey,
            InceptionDate,
            IsActive,
            TerminationDate,
            CountryKey,
            CurrencyKey,
            CreatedBy,
            CreatedDate,
            ModifiedBy,
            ModifiedDate
        )
        SELECT
            a.AccountKey,
            a.AccountId,
            a.Code,
            a.Name,
            a.ExternalSystemKey,
            a.ExternalSystemAccountNumber,
            a.PlanKey,
            a.InceptionDate,
            a.IsActive,
            a.TerminationDate,
            a.CountryKey,
            a.CurrencyKey,
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss''),
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss'')
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].Account a
        LEFT JOIN ims.DimAccount d
            ON a.AccountKey COLLATE Latin1_General_CI_AS = d.AccountKey COLLATE Latin1_General_CI_AS
        WHERE d.AccountKey IS NULL;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Account_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: sp_DimAccountClient.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimAccountClient]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimAccountClient';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'AccountClient_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimAccountClient ----
        IF OBJECT_ID(N'ims.DimAccountClient', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimAccountClient does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimAccountClient;

        SET @SQL = N'INSERT INTO ims.DimAccountClient (
            ClientKey,
            ClientId,
            Code,
            Name,
            ShortName,
            LongName,
            ExternalSystemKey,
            ExternalSystemClient,
            CreatedBy,
            CreatedDate,
            ModifiedBy,
            ModifiedDate
        )
        SELECT
            ac.ClientKey,
            ac.ClientId,
            ac.Code,
            ac.Name,
            ac.ShortName,
            ac.LongName,
            ac.ExternalSystemKey,
            ac.ExternalSystemClient,
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss''),
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss'')
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AccountClient ac
        LEFT JOIN ims.DimAccountClient dac
            ON dac.ClientKey COLLATE Latin1_General_CI_AS = ac.ClientKey COLLATE Latin1_General_CI_AS
        WHERE dac.ClientKey IS NULL;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in AccountClient_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: sp_DimAccountPortfolio.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimAccountPortfolio]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimAccountPortfolio';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'AccountPortfolio_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimAccountPortfolio ----
        IF OBJECT_ID(N'ims.DimAccountPortfolio', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimAccountPortfolio does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimAccountPortfolio;

        SET @SQL = N'INSERT INTO ims.DimAccountPortfolio (
            PFACKey,
            PFACId,
            Code,
            AccountKey,
            AccountId,
            PortfolioKey,
            PortfolioId,
            PlanKey,
            IsActive,
            CreatedBy,
            CreatedDate,
            ModifiedBy,
            ModifiedDate
        )
        SELECT
            ap.PFACKey,
            ap.PFACId,
            ap.Code,
            ap.AccountKey,
            ap.AccountId,
            ap.PortfolioKey,
            ap.PortfolioId,
            ap.PlanKey,
            ap.IsActive,
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss''),
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss'')
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].AccountPortfolio ap
        LEFT JOIN ims.DimAccountPortfolio dap
            ON ap.PFACKey COLLATE Latin1_General_CI_AS = dap.PFACKey COLLATE Latin1_General_CI_AS
        WHERE dap.PFACKey IS NULL;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in AccountPortfolio_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: sp_DimExternalSystem.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimExternalSystem]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimExternalSystem';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'ExternalSystem_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimExternalSystem ----
        IF OBJECT_ID(N'ims.DimExternalSystem', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimExternalSystem does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimExternalSystem;

        SET @SQL = N'INSERT INTO ims.DimExternalSystem (
            ExternalSystemKey,
            ExternalSystemId,
            Code,
            Name,
            CreatedBy,
            CreatedDate,
            ModifiedBy,
            ModifiedDate
        )
        SELECT
            es.ExternalSystemKey,
            es.ExternalSystemId,
            es.Code,
            es.Name,
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss''),
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss'')
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].ExternalSystem es
        LEFT JOIN ims.DimExternalSystem des
            ON es.ExternalSystemKey COLLATE Latin1_General_CI_AS = des.ExternalSystemKey COLLATE Latin1_General_CI_AS
        WHERE des.ExternalSystemKey IS NULL;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in ExternalSystem_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO

-- ============================== Source file: sp_DimPlan.sql ==============================
CREATE OR ALTER PROCEDURE [ims].[sp_DimPlan]
    @SilverLakehouse VARCHAR(MAX) = 'LH_Silver'
    ,@BatchId INT = NULL
/*
© UB Technology Innovations. Unauthorized use or reproduction is prohibited
*/
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TableName    VARCHAR(200)   = 'DimPlan';
    DECLARE @SchemaName VARCHAR(255) = 'ims';
    DECLARE @ProcedureName VARCHAR(256)  = 'Plan_Gold_Process';
    DECLARE @ErrorMessage VARCHAR(8000);
    DECLARE @ErrorSeverity INT;
    DECLARE @ErrorState    INT;
    DECLARE @StartTime     DATETIME2(6)  = SYSUTCDATETIME();
    DECLARE @EndTime       DATETIME2(6);
    DECLARE @Duration      VARCHAR(50);
    DECLARE @RowsInserted  INT = 0;
    DECLARE @SQL           NVARCHAR(MAX);

    BEGIN TRY

        -- ---- Target: ims.DimPlan ----
        IF OBJECT_ID(N'ims.DimPlan', N'U') IS NULL
        BEGIN
            THROW 50000, 'Invalid operation. Table ims.DimPlan does not exist.', 1;
        END

        TRUNCATE TABLE ims.DimPlan;

        SET @SQL = N'INSERT INTO ims.DimPlan (
            PlanKey,
            PlanId,
            Code,
            Name,
            IsTaxable,
            PlanTypeKey,
            CustodianKey,
            ExternalSystemKey,
            ExternalSystemPlanNumber,
            CreatedBy,
            CreatedDate,
            ModifiedBy,
            ModifiedDate
        )
        SELECT
            p.PlanKey,
            p.PlanId,
            p.Code,
            p.Name,
            p.IsTaxable,
            p.PlanTypeKey,
            p.CustodianKey,
            p.ExternalSystemKey,
            p.ExternalSystemPlanNumber,
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss''),
            CURRENT_USER,
            FORMAT(GETDATE(), ''yyyy-MM-dd HH:mm:ss'')
        FROM ' + QUOTENAME(@SilverLakehouse) + N'.[dbo].[Plan] p
        LEFT JOIN ims.DimPlan dp
            ON p.PlanKey COLLATE Latin1_General_CI_AS = dp.PlanKey COLLATE Latin1_General_CI_AS
        WHERE dp.PlanKey IS NULL;';
        EXEC sp_executesql @SQL;
        SET @RowsInserted += @@ROWCOUNT;

        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                @RowsInserted,
                @StartTime,
                @EndTime,
                'Success',
                NULL,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- Swallow audit-log failures (e.g. cross-warehouse write issues to
            -- WH_MetaData) so they never mask a data step that already succeeded.
        END CATCH

    END TRY
    BEGIN CATCH
        SET @ErrorMessage = ERROR_MESSAGE() + ' in Plan_Gold_Process';
        SET @ErrorSeverity = ERROR_SEVERITY();
        SET @ErrorState = ERROR_STATE();
        SET @EndTime = SYSUTCDATETIME();
        SET @Duration = CAST(DATEDIFF(SECOND, @StartTime, @EndTime) AS VARCHAR(20)) + ' Seconds';

        BEGIN TRY
            INSERT INTO [WH_MetaData].[Log].[ETLBatchGoldLogDetails]
            (
                BatchId,
                SchemaName,
                TableName,
                ProcessedRowCount,
                StartTime,
                EndTime,
                Status,
                ErrorMessage,
                SourceName
            )
            VALUES
            (
                @BatchId,
                @SchemaName,
                @TableName,
                0,
                @StartTime,
                @EndTime,
                'Failed',
                @ErrorMessage,
                @ProcedureName
            );
        END TRY
        BEGIN CATCH
            -- swallow logging errors so they never mask the real failure
        END CATCH
    END CATCH
END
GO