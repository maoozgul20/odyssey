"""ODYSSEY backend API.

Run locally:   uvicorn app.main:app --reload --port 8000
Docs:          http://localhost:8000/docs
"""

from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import llm, rag
from .config import ALLOWED_ORIGINS, LLM_MODEL
from .db import cursor
from .transcript import format_met

app = FastAPI(title="ODYSSEY API", version="0.1.0", description="RAG over real NASA mission data.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    db_ok = True
    try:
        with cursor() as cur:
            cur.execute("select count(*) as n from chunks")
            chunks = cur.fetchone()["n"]
    except Exception:
        db_ok, chunks = False, 0
    return {"ok": db_ok, "chunks": chunks, "llm": llm.configured(), "model": LLM_MODEL}


@app.get("/missions/{mission_id}")
def mission(mission_id: str):
    with cursor() as cur:
        cur.execute("select id, title, summary, launch_utc from missions where id = %s", (mission_id,))
        m = cur.fetchone()
        if not m:
            raise HTTPException(404, f"No mission called {mission_id}. Run scripts/ingest_apollo13.py first.")
        cur.execute("select idx, title, description, start_met, end_met from mission_acts where mission_id = %s order by idx", (mission_id,))
        m["acts"] = cur.fetchall()
        cur.execute("select idx, title, start_met, end_met from key_scenes where mission_id = %s order by idx", (mission_id,))
        m["key_scenes"] = cur.fetchall()
        cur.execute("select code, name, short_name, role from speakers where mission_id = %s", (mission_id,))
        m["speakers"] = cur.fetchall()
        cur.execute("select min(met) as first, max(met) as last, count(*) as lines from utterances where mission_id = %s", (mission_id,))
        m["span"] = cur.fetchone()
    for item in m["acts"] + m["key_scenes"]:
        item["start"], item["end"] = format_met(item["start_met"]), format_met(item["end_met"])
    return m


@app.get("/missions/{mission_id}/utterances")
def utterances(mission_id: str, start: int = 0, end: int | None = None, limit: int = Query(200, ge=1, le=1000)):
    """The radio lines between two mission times, in order: the replay feed."""
    with cursor() as cur:
        cur.execute(
            """select met, speaker, text, page, tape, key_line from utterances
               where mission_id = %s and met >= %s and (%s::int is null or met <= %s)
               order by met, id limit %s""",
            (mission_id, start, end, end, min(limit, 1000)),
        )
        rows = cur.fetchall()
    for r in rows:
        r["time"] = format_met(r["met"])
    return rows


class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    k: int = Field(5, ge=1, le=20)
    max_met: int | None = None
    min_met: int | None = None
    rerank: bool = True


@app.post("/search")
def search(body: SearchIn):
    hits = rag.retrieve(body.query, k=body.k, max_met=body.max_met, min_met=body.min_met, use_rerank=body.rerank)
    return {"query": body.query, "covered": rag.covered(hits), "hits": [h.as_dict() for h in hits]}


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    mode: str = Field("flight", pattern="^(flight|crew)$")
    persona: str = Field("CDR", pattern="^(CDR|LMP|CMP|CC)$")
    max_met: int | None = None
    k: int = Field(5, ge=1, le=12)


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.post("/ask")
async def ask(body: AskIn):
    """Server-sent events: one 'sources' event, then 'token' events, then 'done' (or 'error')."""
    hits = await run_in_threadpool(rag.retrieve, body.question, body.k, 30, "a13", body.max_met)
    found = rag.covered(hits)  # judged on retrieved passages only, before adding "just heard" context
    if body.mode == "crew" and body.max_met is not None:
        recent = await run_in_threadpool(rag.recent_context, body.max_met)
        seen = {h.id for h in recent}
        hits = recent + [h for h in hits if h.id not in seen][: body.k]

    async def events():
        yield sse("sources", {"covered": found, "hits": [h.as_dict() for h in hits]})
        if not llm.configured():
            yield sse("error", "Answers are off: LLM_API_KEY is not set on the server.")
            return
        try:
            async for piece in llm.stream_chat(
                rag.system_prompt(body.mode, body.persona, body.max_met), rag.user_prompt(body.question, hits)
            ):
                yield sse("token", piece)
            yield sse("done", True)
        except llm.LLMError as e:
            yield sse("error", str(e))

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
