"""LLM initialization and JSON parsing utilities."""

import re
import json
import time
import random
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import HumanMessage, BaseMessage
from app.modules.finin.core.config import settings


def _is_rate_limit_error(exc: Exception) -> bool:
    """Best-effort detection of a 429 / rate-limit error from the Azure
    OpenAI SDK without importing openai's exception classes directly (they
    move between package versions)."""
    name = type(exc).__name__.lower()
    if "ratelimit" in name:
        return True
    msg = str(exc).lower()
    return "429" in msg or "rate limit" in msg or "too many requests" in msg


def _extract_retry_after(exc: Exception) -> float | None:
    """Pull a server-suggested retry delay (seconds) out of an exception,
    if the SDK/HTTP layer exposed one."""
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers:
        for key in ("retry-after", "Retry-After"):
            val = headers.get(key)
            if val:
                try:
                    return float(val)
                except (TypeError, ValueError):
                    pass
    return None


def invoke_with_retry(llm: AzureChatOpenAI, messages: list[BaseMessage]):
    """Call llm.invoke(...) with exponential backoff on rate-limit (429)
    errors, so a large batch of tables (e.g. 50 template tables) doesn't
    blow up the job the first time Azure throttles a request.

    Non-rate-limit errors are re-raised immediately — callers already
    handle those (e.g. by skipping the table).
    """
    max_retries = settings.LLM_MAX_RETRIES
    base_delay = settings.LLM_RETRY_BASE_DELAY_SECONDS
    max_delay = settings.LLM_RETRY_MAX_DELAY_SECONDS

    attempt = 0
    while True:
        try:
            return llm.invoke(messages)
        except Exception as e:
            if not _is_rate_limit_error(e) or attempt >= max_retries:
                raise

            wait = _extract_retry_after(e)
            if wait is None:
                # Exponential backoff with jitter: base * 2^attempt, capped.
                wait = min(base_delay * (2 ** attempt), max_delay)
                wait += random.uniform(0, base_delay)

            attempt += 1
            print(
                f"⏳ Azure OpenAI rate limit hit (attempt {attempt}/{max_retries}) — "
                f"waiting {wait:.1f}s before retrying…"
            )
            time.sleep(wait)


def make_llm(model: str | None = None, temperature: float = 0.1) -> AzureChatOpenAI:
    """Create an Azure OpenAI chat model instance.

    `model` is accepted for backward compatibility with call sites that used
    to pass a Groq model name — it is ignored. The deployment used is always
    the one configured via the AZURE_OPENAI_DEPLOYMENT environment variable.
    """
    if not settings.AZURE_OPENAI_ENDPOINT or not settings.AZURE_OPENAI_DEPLOYMENT or not settings.AZURE_OPENAI_API_KEY:
        raise RuntimeError(
            "Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, "
            "AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_KEY and "
            "AZURE_OPENAI_API_VERSION in backend/.env"
        )
    return AzureChatOpenAI(
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        azure_deployment=settings.AZURE_OPENAI_DEPLOYMENT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        api_version=settings.AZURE_OPENAI_API_VERSION,
        temperature=temperature,
        max_tokens=4096,
    )


def parse_json_safe(text: str) -> dict | list:
    """Strip markdown fences and parse JSON from LLM response."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text.rstrip())
    m = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    return json.loads(m.group(1) if m else text)


def verify_azure_openai_connection() -> bool:
    """Test Azure OpenAI connectivity on startup."""
    try:
        llm = make_llm()
        llm.invoke([HumanMessage(content="ping")])
        return True
    except Exception as e:
        print(f"Azure OpenAI startup check failed: {e}")
        return False
