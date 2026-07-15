"""Application settings, loaded from environment / backend/.env."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_backend_dir(start: Path) -> Path:
    """Walk up from this file looking for the backend/ root, identified by
    requirements.txt (present at the backend root) or an existing .env.
    Avoids hardcoding a parents[N] index that breaks if this module ever
    moves to a different depth again.
    """
    for candidate in (start, *start.parents):
        if (candidate / "requirements.txt").exists() or (candidate / ".env").exists():
            return candidate
    # Fallback: previous fixed-depth guess (backend/app/modules/finin/core/config.py -> backend/)
    return start.parents[4]


BACKEND_DIR = _find_backend_dir(Path(__file__).resolve().parent)
_ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Azure OpenAI
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_API_VERSION: str = "2024-02-15-preview"

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ]

    # Mapping defaults
    DEFAULT_MIN_CONFIDENCE: float = 0.72
    DEFAULT_BATCH_SIZE: int = 10
    DEFAULT_TEMPERATURE: float = 0.1

    # Rate limiting / throttling for Azure OpenAI calls.
    # LLM_CALL_DELAY_SECONDS is a fixed pause inserted *between* successive
    # table mapping calls (Stage 2 runs one LLM call per template table, so
    # a large template with many tables can otherwise fire dozens of
    # requests back-to-back and trip Azure's TPM/RPM limits).
    LLM_CALL_DELAY_SECONDS: float = 1.5
    LLM_MAX_RETRIES: int = 5
    LLM_RETRY_BASE_DELAY_SECONDS: float = 5.0
    LLM_RETRY_MAX_DELAY_SECONDS: float = 60.0


settings = Settings()

if not settings.AZURE_OPENAI_ENDPOINT or not settings.AZURE_OPENAI_API_KEY:
    if _ENV_FILE.exists():
        print(f"[finin.config] Found {_ENV_FILE} but AZURE_OPENAI_* values are still empty "
              f"— check the key names in that file match exactly: AZURE_OPENAI_ENDPOINT, "
              f"AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION.")
    else:
        print(f"[finin.config] No .env found at {_ENV_FILE} — place your Azure OpenAI keys there.")