import logging
import secrets
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, Request, status
from jwt import InvalidTokenError, PyJWKClient, decode
from fastapi_users.exceptions import UserNotExists
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import RoleName
from app.core.rate_limit import limiter
from app.core.tokens import (
    create_access_token,
    create_refresh_token,
    prepare_refresh_token,
    persist_refresh_token,
    revoke_all_user_refresh_tokens,
    rotate_refresh_token,
)
from app.db.session import get_async_session
from app.modules.users.repository import assign_role_to_user, get_user_by_email_lean
from app.modules.auth.schema import (
        EntraIdExchangeRequest,
        RefreshRequest,
        TokenPairResponse,
        UserCreate,
        UserRead,
)
from app.modules.auth.service import fastapi_users, get_user_manager
from app.modules.auth.dependency import current_active_user
from app.modules.users.models.user import User

router = APIRouter(tags=["auth"])


# ---------------------------------------------------------------------------
# Azure AD helpers
# ---------------------------------------------------------------------------

def _get_issuer() -> str:
    if settings.AZURE_AD_ISSUER:
        return settings.AZURE_AD_ISSUER
    return f"https://login.microsoftonline.com/{settings.AZURE_AD_TENANT_ID}/v2.0"


def _get_jwks_url() -> str:
    tenant = settings.AZURE_AD_TENANT_ID or "common"
    return (
        f"https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys"
    )


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    return PyJWKClient(_get_jwks_url())


@lru_cache(maxsize=1)
def _get_common_jwks_client() -> PyJWKClient:
    return PyJWKClient("https://login.microsoftonline.com/common/discovery/v2.0/keys")


def _verify_azure_token(token: str) -> dict[str, Any]:
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
    except Exception:
        jwks_client = _get_common_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)

    audiences = [
        settings.AZURE_AD_CLIENT_ID,
        f"api://{settings.AZURE_AD_CLIENT_ID}",
        "https://api.fabric.microsoft.com",
        "https://api.fabric.microsoft.com/",
        "https://analysis.windows.net/powerbi/api",
        "97965ee1-a573-4ddf-9b1c-dc060d685776",
        "https://graph.microsoft.com",
    ]

    claims = decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=audiences,
        options={
            "require": ["exp", "iat", "iss"],
            "verify_aud": False,
        },
    )

    issuer = str(claims.get("iss", ""))
    if not (
        issuer.startswith("https://login.microsoftonline.com/")
        or issuer.startswith("https://sts.windows.net/")
        or "microsoftonline.com" in issuer
        or "windows.net" in issuer
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Azure AD issuer: {issuer}",
        )

    return claims


# ---------------------------------------------------------------------------
# Custom endpoints: login, refresh, logout, SSO exchange
# ---------------------------------------------------------------------------


@router.post("/jwt/login", response_model=TokenPairResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def jwt_login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    user_manager=Depends(get_user_manager),
    db: AsyncSession = Depends(get_async_session),
):
    """Email/password login → access token + refresh token."""
    @dataclass
    class _Creds:
        username: str
        password: str

    user = await user_manager.authenticate(
        credentials=_Creds(username=username, password=password),
    )

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LOGIN_BAD_CREDENTIALS",
        )

    # Revoke any existing refresh tokens for this user
    await revoke_all_user_refresh_tokens(db, user.id)

    access_token = create_access_token(user.id, user.email)
    refresh_token = await create_refresh_token(db, user.id)

    return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/jwt/refresh", response_model=TokenPairResponse)
@limiter.limit(settings.RATE_LIMIT_REFRESH)
async def jwt_refresh(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_async_session),
):
    """Rotate the refresh token and get a new access token.

    The new refresh token inherits the original session expiry (no sliding window).
    """
    result = await rotate_refresh_token(db, body.refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_REFRESH_TOKEN",
        )

    new_refresh_token, user = result
    access_token = create_access_token(user.id, user.email)

    return TokenPairResponse(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/jwt/logout")
async def jwt_logout(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    """Revoke all refresh tokens for the current user."""
    await revoke_all_user_refresh_tokens(db, user.id)
    return {"detail": "Successfully logged out"}


async def _sso_background_tasks(
    user_id,
    jti: str,
    expires_at,
    azure_oid: str | None,
    current_azure_oid: str | None,
) -> None:
    """Persist refresh token + cleanup — runs AFTER the response is sent."""
    from app.db.session import async_session_maker

    async with async_session_maker() as db:
        # Persist the refresh token so it works on first refresh attempt
        await persist_refresh_token(db, user_id, jti, expires_at)

        # Revoke old refresh tokens
        await revoke_all_user_refresh_tokens(db, user_id, exclude_jti=jti)

        # Update Azure AD object ID if changed
        if azure_oid and current_azure_oid != azure_oid:
            from sqlalchemy import update
            from app.modules.users.models.user import User as UserModel

            await db.execute(
                update(UserModel)
                .where(UserModel.id == user_id)
                .values(azure_oid=azure_oid)
            )
            await db.commit()


@router.post("/entra-id/exchange", response_model=TokenPairResponse)
@limiter.limit(settings.RATE_LIMIT_SSO_EXCHANGE)
async def exchange_entra_id_token(
    request: Request,
    payload: EntraIdExchangeRequest,
    background_tasks: BackgroundTasks,
    user_manager=Depends(get_user_manager),
    db: AsyncSession = Depends(get_async_session),
):
    logger = logging.getLogger(__name__)

    # ── Step 1: Verify Azure AD token (CPU-only, JWKS cached) ────
    try:
        claims = _verify_azure_token(payload.id_token)
    except InvalidTokenError as exc:
        logger.exception("Invalid Azure AD token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Azure AD token",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Azure token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Token verification error: {type(exc).__name__}: {exc}",
        ) from exc

    email = (
        claims.get("preferred_username")
        or claims.get("email")
        or claims.get("upn")
        or claims.get("unique_name")
    )
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email claim not found in token",
        )

    azure_oid = claims.get("oid")

    # ── Step 2: Look up existing user (1 lean DB query, no relationships)
    user = await get_user_by_email_lean(db, email)

    if user is None:
        # New user — must create inline (need user.id for JWT)
        random_suffix = secrets.token_urlsafe(24)
        temp_password = f"SSO!Temp_{random_suffix}"
        user_create = UserCreate(email=email, password=temp_password)
        user = await user_manager.create(user_create, safe=True)
        user.is_sso = True
        user.is_verified = True
        db.add(user)
        await db.commit()
        await db.refresh(user)
        await assign_role_to_user(db, str(user.id), RoleName.USER)

    # ── Step 3: Issue tokens (ALL CPU — no DB) ───────────────────
    access_token = create_access_token(user.id, user.email)
    refresh_jwt, jti, expires_at = prepare_refresh_token(user.id)

    # ── Step 4: RESPOND immediately — user is in the app ─────────
    # Persist refresh token + revoke old ones + update oid in background
    background_tasks.add_task(
        _sso_background_tasks,
        user_id=user.id,
        jti=jti,
        expires_at=expires_at,
        azure_oid=azure_oid,
        current_azure_oid=getattr(user, "azure_oid", None),
    )

    return TokenPairResponse(access_token=access_token, refresh_token=refresh_jwt)


# ---------------------------------------------------------------------------
# FastAPI Users built-in routers (register, password reset, verify)
# ---------------------------------------------------------------------------

router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    tags=["auth"],
)
router.include_router(
    fastapi_users.get_reset_password_router(),
    tags=["auth"],
)
router.include_router(
    fastapi_users.get_verify_router(UserRead),
    tags=["auth"],
)
