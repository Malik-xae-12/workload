import os
from pathlib import Path
from typing import AsyncGenerator

from fastapi import Depends
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import AsyncAdaptedQueuePool, StaticPool

from app.core.config import settings
from app.db.base import Base
from app.db import models_import  # noqa: F401  — registers all models on Base.metadata
from app.modules.users.models.user import User


def _resolve_db_url(url: str) -> str:
    """Convert relative SQLite paths to absolute so --reload can't lose the DB."""
    if url.startswith("sqlite"):
        prefix, _, path = url.partition(":///")
        if path and not os.path.isabs(path):
            backend_dir = Path(__file__).resolve().parent.parent
            abs_path = str(backend_dir / path)
            return f"{prefix}:///{abs_path}"
    return url


def _get_db_url() -> str:
    """Return the database URL based on the PROD flag."""
    if settings.PROD:
        url = settings.PROD_DATABASE_URL
        # Ensure critical ODBC performance parameters are present for Azure SQL
        if "mssql" in url and "aioodbc" in url:
            separator = "&" if "?" in url else "?"
            extra_params = []
            lower_url = url.lower()
            if "encrypt=" not in lower_url:
                extra_params.append("Encrypt=yes")
            if "trustservercertificate=" not in lower_url:
                extra_params.append("TrustServerCertificate=no")
            if "connection+timeout=" not in lower_url and "connect+timeout=" not in lower_url:
                extra_params.append("Connection+Timeout=10")
            if "mars_connection=" not in lower_url:
                extra_params.append("Mars_Connection=Yes")
            if extra_params:
                url = url + separator + "&".join(extra_params)
        return url
    return _resolve_db_url(settings.DATABASE_URL)


def _build_engine_kwargs() -> dict:
    """Return engine kwargs optimized for the active database backend."""
    db_url = _get_db_url()

    if db_url.startswith("sqlite"):
        return {"echo": False, "poolclass": StaticPool}

    # Production MSSQL / PostgreSQL – aggressive connection pooling
    return {
        "echo": False,
        "poolclass": AsyncAdaptedQueuePool,
        "pool_size": 10,          # persistent connections kept open
        "max_overflow": 20,       # extra connections under burst load
        "pool_timeout": 30,       # seconds to wait for a free connection
        "pool_recycle": 900,      # recycle connections every 15 min
        "pool_pre_ping": False,   # skip extra SELECT 1 round-trip per request
    }


engine = create_async_engine(
    _get_db_url(),
    **_build_engine_kwargs(),
)

if _get_db_url().startswith("sqlite"):
    from sqlalchemy import event

    # By default SQLite uses its legacy rollback-journal mode, which takes an
    # exclusive lock and fsyncs on every write commit — every notebook/pipeline
    # status PATCH (there are a lot of these: upload, run-start, each poll
    # tick's completion) blocks any concurrent read, and the whole app.db file
    # gets fsynced for each one. WAL mode lets reads proceed concurrently with
    # writes and batches fsyncs, which is the single biggest win for app.db
    # feeling slow under this app's read-heavy/poll-heavy access pattern.
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-64000")  # 64MB page cache
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

async_session_maker = async_sessionmaker(
    engine, expire_on_commit=settings.EXPIRE_ON_COMMIT
)


async def create_db_and_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrate_existing_db()


async def _migrate_existing_db() -> None:
    """Lightweight, idempotent migration for DBs created before this fix.

    `Base.metadata.create_all` only creates tables/indexes that don't exist
    yet — it never touches an existing `config_uploads` table, so the new
    composite index has to be added explicitly here. This also cleans up
    duplicate config_upload rows left behind by earlier upload attempts that
    saved the same pipeline/notebook under two different item_name values
    (e.g. an unprefixed "01_PL_SQL_ConfigCreation" from a pre-fix failed
    upload sitting alongside the real, connection-prefixed, successfully
    deployed row) — those stale rows are what made a successfully-run
    pipeline still show up as "Failed"/stuck "Running" after a refresh.
    """
    from sqlalchemy import text

    async with engine.begin() as conn:
        if _get_db_url().startswith("sqlite"):
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_config_uploads_project_type_name "
                "ON config_uploads (project_id, item_type, item_name)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_config_uploads_fabric_item_id "
                "ON config_uploads (fabric_item_id)"
            ))
            # Same story as the index above: create_all() never adds columns
            # to a table that already exists, so source_connections rows
            # created before ai_mapping_saved/status/status_error were added
            # to the model are missing them entirely — every query against
            # the table (including ones that don't touch these columns)
            # fails with "no such column" because SQLAlchemy always selects
            # every mapped column. Add them if absent, defaulting to values
            # that mean "nothing has changed" for pre-existing rows.
            existing_cols = {
                row[1]
                for row in (
                    await conn.execute(text("PRAGMA table_info(source_connections)"))
                ).fetchall()
            }
            if "ai_mapping_saved" not in existing_cols:
                await conn.execute(text(
                    "ALTER TABLE source_connections ADD COLUMN ai_mapping_saved BOOLEAN NOT NULL DEFAULT 0"
                ))
            if "status" not in existing_cols:
                await conn.execute(text(
                    "ALTER TABLE source_connections ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'"
                ))
            if "status_error" not in existing_cols:
                await conn.execute(text(
                    "ALTER TABLE source_connections ADD COLUMN status_error VARCHAR(1000)"
                ))
        # Dedupe project<->connection links created by the (now-fixed)
        # non-idempotent create_project_link — a connection could get TWO
        # link rows for the same project (one from the atomic create+link
        # call, one from the frontend's follow-up fallback call), which made
        # it appear twice in listProjectConnections. Keep one arbitrary link
        # per (project_id, source_connection_id) pair and drop the rest —
        # which one survives doesn't matter, the rows are otherwise identical.
        await conn.execute(text(
            """
            DELETE FROM project_source_connections
            WHERE id NOT IN (
                SELECT MIN(id) FROM project_source_connections
                GROUP BY project_id, source_connection_id
            )
            """
        ))

        # Remove rows that never got a real Fabric item id (failed/dead
        # upload attempts) when a sibling row for the same project +
        # connection + item_type + Fabric item exists with a real
        # fabric_item_id and a *newer* updated_at — i.e. keep whichever row
        # actually reflects what's deployed in Fabric today.
        await conn.execute(text(
            """
            DELETE FROM config_uploads
            WHERE fabric_item_id IS NULL
              AND EXISTS (
                SELECT 1 FROM config_uploads AS good
                WHERE good.project_id = config_uploads.project_id
                  AND good.source_connection_id = config_uploads.source_connection_id
                  AND good.item_type = config_uploads.item_type
                  AND good.fabric_item_id IS NOT NULL
                  AND good.updated_at >= config_uploads.updated_at
                  AND good.id != config_uploads.id
              )
            """
        ))


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)