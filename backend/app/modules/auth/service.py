import secrets
import urllib.parse
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, Request
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from fastapi_users import (
        BaseUserManager,
        FastAPIUsers,
        UUIDIDMixin,
        InvalidPasswordException,
)
from fastapi_users.authentication import (
        AuthenticationBackend,
        BearerTransport,
        JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase

from app.core.config import settings
from app.core.permissions import RoleName
from app.core.security import validate_password_rules
from app.modules.users.repository import assign_role_to_user
from app.db.session import get_user_db, get_async_session
from app.modules.users.models.user import User
from app.modules.auth.schema import UserCreate
from app.shared.constants import AUTH_URL_PATH


def get_email_config() -> ConnectionConfig:
    return ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME,
        MAIL_PASSWORD=settings.MAIL_PASSWORD,
        MAIL_FROM=settings.MAIL_FROM,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
        MAIL_STARTTLS=settings.MAIL_STARTTLS,
        MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
        USE_CREDENTIALS=settings.USE_CREDENTIALS,
        VALIDATE_CERTS=settings.VALIDATE_CERTS,
        TEMPLATE_FOLDER=Path(__file__).parent / settings.TEMPLATE_DIR,
    )


async def send_reset_password_email(user: User, token: str) -> None:
    if not all([settings.MAIL_SERVER, settings.MAIL_PORT, settings.MAIL_FROM]):
        raise ValueError(
            "Email configuration incomplete. "
            f"MAIL_SERVER={settings.MAIL_SERVER}, "
            f"MAIL_PORT={settings.MAIL_PORT}, "
            f"MAIL_FROM={settings.MAIL_FROM}"
        )

    conf = get_email_config()
    email = user.email
    base_url = f"{settings.FRONTEND_URL}/password-recovery/confirm?"
    params = {"token": token}
    encoded_params = urllib.parse.urlencode(params)
    link = f"{base_url}{encoded_params}"

    message = MessageSchema(
        subject="Password recovery",
        recipients=[email],
        template_body={"username": email, "link": link},
        subtype=MessageType.html,
    )

    fm = FastMail(conf)
    await fm.send_message(message, template_name="password_reset.html")


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.RESET_PASSWORD_SECRET_KEY
    verification_token_secret = settings.VERIFICATION_SECRET_KEY

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"User {user.id} has registered.")
        # Assign default "user" role
        async for db in get_async_session():
            await assign_role_to_user(db, str(user.id), RoleName.USER)
            break

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        try:
            await send_reset_password_email(user, token)
        except Exception as exc:
            print(
                "CRITICAL ERROR: Failed to send password reset email: "
                f"{type(exc).__name__}: {str(exc)}"
            )

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        print(
            f"Verification requested for user {user.id}. Verification token: {token}"
        )

    async def validate_password(
        self,
        password: str,
        user: UserCreate,
    ) -> None:
        errors = validate_password_rules(password, user.email)

        if errors:
            raise InvalidPasswordException(reason=errors)


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl=f"{AUTH_URL_PATH}/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.ACCESS_SECRET_KEY,
        lifetime_seconds=settings.ACCESS_TOKEN_EXPIRE_SECONDS,
    )


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
