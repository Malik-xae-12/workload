"""FastAPI routes for the read-only mapping chat assistant."""

from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.modules.finin.shared.job_store import get_job
from app.modules.finin.core.llm import make_llm, invoke_with_retry
from app.modules.finin.chat.service import build_chat_context, CHAT_SYSTEM_PROMPT

router = APIRouter(tags=["chat"])

MAX_HISTORY_TURNS = 8


@router.post("/api/chat/{job_id}")
def chat_about_mapping(job_id: str, body: dict):
    """Read-only chat assistant that explains mapping results.

    This endpoint never mutates job state, mapping rows, or overrides — it
    only reads the existing job result and asks the LLM to explain it.
    """
    job = get_job(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(status_code=404, detail="Job not ready")

    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    history = body.get("history") or []
    context = build_chat_context(job)

    messages = [SystemMessage(content=CHAT_SYSTEM_PROMPT + "\n\nCurrent mapping data:\n" + context)]
    for turn in history[-MAX_HISTORY_TURNS:]:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=message))

    try:
        llm = make_llm(temperature=0.2)
        response = invoke_with_retry(llm, messages)
        reply = response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat assistant failed: {e}")

    return {"reply": reply}
