from sqlalchemy import text

from app.modules.users.repository import seed_roles
from app.db.session import create_db_and_tables, async_session_maker, engine


async def create_database() -> None:
    await create_db_and_tables()
    async with async_session_maker() as session:
        await seed_roles(session)
    # Warm the connection pool so the first user request is fast
    await _warm_pool()
    # Pre-fetch JWKS signing keys so the first SSO login is instant
    _warm_jwks()


async def _warm_pool() -> None:
    """Open a few connections upfront so they're ready for incoming requests."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


def _warm_jwks() -> None:
    """Pre-fetch Azure AD JWKS keys so the first token verification is fast."""
    try:
        from app.core.config import settings
        if settings.AZURE_AD_TENANT_ID:
            from app.modules.auth.router import _get_jwks_client
            _get_jwks_client()  # triggers lru_cache + HTTP fetch
    except Exception:
        pass  # non-fatal — keys will be fetched on first request
