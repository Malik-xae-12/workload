from pathlib import Path
from typing import Set
import json

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # OpenAPI docs
    OPENAPI_URL: str = "/openapi.json"

    # Environment
    PROD: bool = False

    # Database
    DATABASE_URL: str
    PROD_DATABASE_URL: str 
    TEST_DATABASE_URL: str | None = None
    EXPIRE_ON_COMMIT: bool = False

    # User
    ACCESS_SECRET_KEY: str
    REFRESH_SECRET_KEY: str
    RESET_PASSWORD_SECRET_KEY: str
    VERIFICATION_SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_SECONDS: int = 900  # 15 minutes
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Azure AD (Entra ID)
    AZURE_AD_TENANT_ID: str | None = None
    AZURE_AD_CLIENT_ID: str | None = None
    AZURE_AD_ISSUER: str | None = None

    # Fabric Service Principal (falls back to AZURE_AD_* if not set)
    FABRIC_CLIENT_ID: str | None = None
    FABRIC_CLIENT_SECRET: str | None = None
    FABRIC_TENANT_ID: str | None = None
    FABRIC_CAPACITY_ID: str | None = None

    # Finin's "Template" lakehouse/warehouse often lives in a different Fabric
    # workspace than the project's own (a shared reference schema). If set,
    # Finin looks it up there by name instead of assuming it's in the same
    # workspace as the project's metadata warehouse. The service principal
    # above must be granted access to this workspace/item in Fabric too.
    FININ_TEMPLATE_WORKSPACE_ID: str | None = None
    FININ_TEMPLATE_ITEM_NAME: str = "Template_lakehouse"

    @model_validator(mode="after")
    def _fabric_defaults_from_azure_ad(self):
        """Reuse Azure AD app registration for Fabric SP if not set separately."""
        if not self.FABRIC_CLIENT_ID and self.AZURE_AD_CLIENT_ID:
            self.FABRIC_CLIENT_ID = self.AZURE_AD_CLIENT_ID
        if not self.FABRIC_TENANT_ID and self.AZURE_AD_TENANT_ID:
            self.FABRIC_TENANT_ID = self.AZURE_AD_TENANT_ID
        return self

    # Email
    MAIL_USERNAME: str | None = None
    MAIL_PASSWORD: str | None = None
    MAIL_FROM: str | None = None
    MAIL_SERVER: str | None = None
    MAIL_PORT: int | None = None
    MAIL_FROM_NAME: str = "FastAPI template"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True
    TEMPLATE_DIR: str = "email_templates"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # CORS
    CORS_ORIGINS: list[str] = []

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
            return [s.strip() for s in v.split(",") if s.strip()]
        return v or []

    # Rate limiting (requests per minute)
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_REFRESH: str = "10/minute"
    RATE_LIMIT_SSO_EXCHANGE: str = "10/minute"

    # CSRF
    CSRF_SECRET: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
