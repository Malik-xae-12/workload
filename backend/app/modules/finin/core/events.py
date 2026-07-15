"""Startup/shutdown lifecycle events."""

from app.modules.finin.core.config import settings
from app.modules.finin.core.llm import verify_azure_openai_connection


def check_azure_openai_connection() -> None:
    """Verify Azure OpenAI is reachable at startup and log the result."""
    ok = verify_azure_openai_connection()
    if ok:
        print(f"Azure OpenAI / LangGraph ready — deployment: {settings.AZURE_OPENAI_DEPLOYMENT}")
    else:
        print("Azure OpenAI startup check failed — running in degraded mode")
