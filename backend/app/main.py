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

from . import decisions, llm, rag
from .graph import router as graph_router
from .lab import router as lab_router
from .mars import router as mars_router
from .starship import router as starship_router
from .config import ALLOWED_ORIGINS, LLM_MODEL, ROOT
from .db import cursor
from .transcript import format_met

app = FastAPI(title="ODYSSEY API", version="0.2.0", description="RAG over real NASA mission data: transcripts, exoplanet tables, papers, Mars pictures and a knowledge graph.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # any port on your own computer is allowed too (Next.js moves to 3001 if 3000 is busy)
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
for r in (starship_router, lab_router, mars_router, graph_router):
    app.include_router(r)


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
    # 1. what has just been said on the radio (only when we know "now")
    recent = await run_in_threadpool(rag.recent_lines, body.max_met) if body.max_met is not None else []

    # 2. query rewriting: turn "What just happened?" into "oxygen tank, main bus B undervolt"
    query = body.question
    if llm.configured() and (body.mode == "crew" or rag.is_vague(body.question)) and recent:
        try:
            rewritten = await llm.complete(rag.REWRITE_SYSTEM, rag.rewrite_prompt(body.question, recent))
            rewritten = rewritten.strip().strip('"').splitlines()[0][:200] if rewritten.strip() else ""
            if len(rewritten) >= 3:
                query = rewritten
        except llm.LLMError:
            pass  # search with the original words instead

    # 3. hybrid retrieval + reranking + relevance cutoff
    hits = await run_in_threadpool(rag.retrieve, query, body.k, 30, "a13", body.max_met)
    found = rag.covered(hits)  # judged on retrieved passages only, before adding "just heard" context
    if body.mode == "crew" and recent:
        seen = {h.id for h in recent}
        hits = recent + [h for h in hits if h.id not in seen][: body.k]

    async def events():
        yield sse("sources", {"covered": found, "query": query, "rewritten": query != body.question, "hits": [h.as_dict() for h in hits]})
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


# ---------- decision points ----------


@app.get("/decisions")
def list_decisions():
    """The crisis decisions, in mission order, without the answers."""
    return [decisions.public(d) for d in decisions.load()]


class AnswerIn(BaseModel):
    choice: str = Field(pattern="^[abc]$")


@app.post("/decisions/{decision_id}/answer")
async def answer_decision(decision_id: str, body: AnswerIn):
    """Score the player's choice and explain what NASA really did, grounded in the transcript."""
    try:
        return await decisions.judge(decision_id, body.choice)
    except KeyError:
        raise HTTPException(404, f"No decision called {decision_id}")


# ---------- evaluation ----------


@app.get("/eval")
def eval_results():
    """The last saved run of scripts/run_eval.py."""
    path = ROOT / "data" / "eval_results.json"
    if not path.exists():
        raise HTTPException(404, "No evaluation yet. Run: python scripts/run_eval.py")
    return json.loads(path.read_text(encoding="utf-8"))
