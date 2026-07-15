import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.auth.models.refresh_token import RefreshToken
from app.modules.users.models.user import User

logger = logging.getLogger(__name__)


def create_access_token(user_id: uuid.UUID, email: str | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "aud": ["fastapi-users:auth"],
        "iat": now,
        "exp": now + timedelta(seconds=settings.ACCESS_TOKEN_EXPIRE_SECONDS),
        "type": "access",
    }
    if email:
        payload["email"] = email
    return jwt.encode(payload, settings.ACCESS_SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.ACCESS_SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        audience=["fastapi-users:auth"],
        options={"require": ["exp", "iat", "sub"]},
    )


def _encode_refresh_jwt(user_id: uuid.UUID, jti: str, expires_at: datetime) -> str:
    """Create a signed JWT refresh token with the given jti and fixed expiry."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": expires_at,
        "type": "refresh",
        "jti": jti,
    }
    return jwt.encode(payload, settings.REFRESH_SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_refresh_token(token: str) -> dict:
    """Decode and verify a refresh JWT. Raises InvalidTokenError on failure."""
    payload = jwt.decode(
        token,
        settings.REFRESH_SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"require": ["exp", "iat", "sub", "jti"]},
    )
    if payload.get("type") != "refresh":
        raise InvalidTokenError("Not a refresh token")
    return payload


def prepare_refresh_token(
    user_id: uuid.UUID,
    expires_at: datetime | None = None,
) -> tuple[str, str, datetime]:
    """Generate a refresh JWT without touching the database.

    Returns (jwt_string, jti, expires_at) so the caller can persist later.
    """
    if expires_at is None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = str(uuid.uuid4())
    token_str = _encode_refresh_jwt(user_id, jti, expires_at)
    return token_str, jti, expires_at


async def persist_refresh_token(
    db: AsyncSession,
    user_id: uuid.UUID,
    jti: str,
    expires_at: datetime,
) -> None:
    """Persist a previously generated refresh token jti to the database."""
    refresh_token = RefreshToken(
        id=str(uuid.uuid4()),
        token=jti,
        user_id=str(user_id),
        expires_at=expires_at,
        revoked=False,
    )
    db.add(refresh_token)
    await db.commit()
    logger.info("Persisted refresh token jti=%s for user=%s", jti, user_id)


async def create_refresh_token(
    db: AsyncSession,
    user_id: uuid.UUID,
    expires_at: datetime | None = None,
) -> str:
    """Create a new refresh token (JWT) and persist its jti in the database.

    Args:
        expires_at: Fixed session expiry carried over from the original login.
                    If None (fresh login), set to now + REFRESH_TOKEN_EXPIRE_DAYS.
    """
    token_str, jti, expires_at = prepare_refresh_token(user_id, expires_at)
    await persist_refresh_token(db, user_id, jti, expires_at)
    return token_str


async def rotate_refresh_token(db: AsyncSession, old_token: str) -> tuple[str, User] | None:
    """Validate, revoke, and reissue a refresh token with the same fixed expiry.

    The new token inherits the original session's expiry — no sliding window.
    Returns (new_token, user) or None if invalid/expired/revoked."""
    # 1. Verify JWT signature and expiry (no DB hit)
    try:
        payload = decode_refresh_token(old_token)
    except InvalidTokenError as exc:
        logger.warning("Refresh token decode failed: %s", exc)
        return None

    jti = payload["jti"]
    logger.info("Refresh token rotation attempt for jti=%s, user=%s", jti, payload.get("sub"))

    # 2. Check DB for revocation status
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token == jti,
            RefreshToken.revoked == False,  # noqa: E712
        )
    )
    existing = result.scalar_one_or_none()

    if not existing:
        logger.warning("Refresh token jti=%s not found or already revoked", jti)
        return None

    # Revoke the old token
    existing.revoked = True

    # 3. Load and verify the user
    user_result = await db.execute(select(User).where(User.id == existing.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        await db.commit()
        return None

    # 4. Issue new refresh token with THE SAME expiry as the original
    original_expiry = existing.expires_at.replace(tzinfo=timezone.utc)
    new_token = await create_refresh_token(db, existing.user_id, expires_at=original_expiry)
    return new_token, user


async def revoke_refresh_token(db: AsyncSession, token: str) -> bool:
    """Revoke a single refresh token (JWT). Returns True if found and revoked."""
    try:
        payload = decode_refresh_token(token)
    except InvalidTokenError:
        return False

    jti = payload["jti"]
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token == jti, RefreshToken.revoked == False)  # noqa: E712
        .values(revoked=True)
    )
    await db.commit()
    return result.rowcount > 0


async def revoke_all_user_refresh_tokens(
    db: AsyncSession, user_id: uuid.UUID, *, exclude_jti: str | None = None,
) -> int:
    """Revoke all refresh tokens for a user. Returns count revoked."""
    stmt = (
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)  # noqa: E712
        .values(revoked=True)
    )
    if exclude_jti:
        stmt = stmt.where(RefreshToken.token != exclude_jti)
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount
