"""AI Insights router — natural language query endpoint with SSE streaming."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.ai_insights.service import stream_insight

router = APIRouter(prefix="/ai-insights", tags=["AI Insights"])


class InsightQueryRequest(BaseModel):
    question: str
    investment_id: int | None = None
    scope: Literal["investment", "all"] = "investment"
    # Conversation history: list of {role: "user"|"assistant", content: str}
    history: list[dict] = []


@router.post("/query")
async def query_insight(
    body: InsightQueryRequest,
    db: Session = Depends(get_db),
):
    """Stream an AI-generated insight as Server-Sent Events.

    Returns text/event-stream. Each event is:
      data: {"text": "...chunk..."}
    Terminated by:
      data: [DONE]

    Conversation history is passed by the client each request (session-only,
    no server-side persistence).
    """
    if not body.question.strip():
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="question must not be empty")

    investment_id = body.investment_id if body.scope == "investment" else None

    return StreamingResponse(
        stream_insight(
            db=db,
            question=body.question,
            investment_id=investment_id,
            scope=body.scope,
            history=body.history,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering for SSE
        },
    )
