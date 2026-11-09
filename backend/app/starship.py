"""Station 3, Starship: RAG over a TABLE (6,000 real exoplanets) and over research papers.

Table RAG works differently from text RAG. A table answers questions like "the 5 closest
rocky planets in the habitable zone" exactly, but only with a query. So:

    question -> the model writes a query PLAN (JSON, not SQL)  -> we validate every column,
             operator and value against a whitelist -> we build parameterised SQL ourselves
             -> rows                                             (precise facts)
    question -> hybrid search over paper abstracts -> rerank     (scientific context)
    rows + papers -> numbered sources -> grounded, cited answer

The model never writes SQL, so it cannot run anything we did not allow.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from . import embeddings, llm, rag
from .db import cursor
from .planets import BOOL, COLUMNS, NUMERIC, PUBLIC, TEXT
from .util import first_json, numbered, sse, stream

router = APIRouter(prefix="", tags=["starship"])

OPS = {"=", "!=", "<", "<=", ">", ">=", "contains", "is_null", "not_null"}
AGGS = {"count", "avg", "min", "max"}


@lru_cache(maxsize=1)
def _galaxy() -> dict:
    with cursor() as cur:
        cur.execute(
            "select name, host, ra, dec, dist_pc, radius, eq_temp, in_hz, esi, size_class, disc_method, disc_year from planets where ra is not null and dec is not null and dist_pc is not null"
        )
        rows = cur.fetchall()
    cols = ["name", "host", "ra", "dec", "dist_pc", "radius", "eq_temp", "in_hz", "esi", "size_class", "disc_method", "disc_year"]
    # columns as arrays keep the JSON small (about 6,000 planets)
    return {"count": len(rows), "columns": cols, "rows": [[r[c] for c in cols] for r in rows]}


@router.get("/planets/galaxy")
def galaxy():
    try:
        return _galaxy()
    except Exception as e:
        _galaxy.cache_clear()
        raise HTTPException(503, f"No planets yet. Run scripts/ingest_exoplanets.py ({e.__class__.__name__}).")


@router.get("/planets/{name}")
def planet(name: str):
    with cursor() as cur:
        cur.execute(f"select {', '.join(PUBLIC)}, description from planets where name = %s", (name,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, f"No planet called {name}")
        cur.execute("select name, radius, period, in_hz from planets where host = %s and name <> %s order by period nulls last", (p["host"], name))
        p["siblings"] = cur.fetchall()
        cur.execute("select id, title, published, url from papers where %s = any(mentions) order by published desc nulls last limit 6", (p["host"],))
        p["papers"] = cur.fetchall()
    return p


# ---------- the query plan ----------

PLAN_SYSTEM = (
    "You turn a question about exoplanets into a JSON query plan for a table named planets. Columns:\n"
    + "\n".join(f"- {c}: {d}" for c, d in COLUMNS.items())
    + "\n\nReply with ONLY a JSON object with these keys:\n"
    '{"filters": [{"column": "...", "op": "= | != | < | <= | > | >= | contains | is_null | not_null", "value": ...}],\n'
    ' "sort": {"column": "...", "dir": "asc|desc"} or null,\n'
    ' "limit": 1-25,\n'
    ' "aggregate": {"fn": "count|avg|min|max", "column": "..." , "group_by": "column or null"} or null,\n'
    ' "paper_query": "a short search phrase for research papers about the scientific topic"}\n'
    "Rules: 'contains' is a case-insensitive text match (use it for host, name, disc_facility). Rocky means radius <= 1.6. "
    "Light years = parsecs * 3.26. Closest means sort dist_pc asc. Most Earth-like means sort esi desc. "
    "Use aggregate only for how many / average / which-most questions. If the question names a planet, filter name contains it."
)


class Plan(BaseModel):
    filters: list[dict] = []
    sort: dict | None = None
    limit: int = 10
    aggregate: dict | None = None
    paper_query: str | None = None


def build_sql(plan: dict) -> tuple[str, list, dict]:
    """Validate the plan and build parameterised SQL. Anything not on the whitelist is dropped."""
    where, params, clean = [], [], {"filters": [], "sort": None, "limit": 10, "aggregate": None}
    for f in (plan.get("filters") or [])[:8]:
        col, op, val = f.get("column"), f.get("op"), f.get("value")
        if col not in COLUMNS or op not in OPS:
            continue
        if op == "is_null":
            where.append(f"{col} is null")
        elif op == "not_null":
            where.append(f"{col} is not null")
        elif op == "contains":
            if col not in TEXT or not isinstance(val, str):
                continue
            where.append(f"{col} ilike %s")
            params.append(f"%{val[:80]}%")
        elif col in NUMERIC:
            try:
                val = float(val)
            except (TypeError, ValueError):
                continue
            where.append(f"{col} {op} %s")
            params.append(val)
        elif col in BOOL:
            if op not in ("=", "!="):
                continue
            val = bool(val) if not isinstance(val, str) else val.lower() == "true"
            where.append(f"{col} {op} %s")
            params.append(val)
        elif col in TEXT:
            if op not in ("=", "!=") or not isinstance(val, str):
                continue
            where.append(f"lower({col}) {op} lower(%s)")
            params.append(val[:80])
        else:
            continue
        clean["filters"].append({"column": col, "op": op, "value": val})
    cond = (" where " + " and ".join(where)) if where else ""

    agg = plan.get("aggregate") or None
    if agg and agg.get("fn") in AGGS:
        fn, col, group = agg["fn"], agg.get("column"), agg.get("group_by")
        expr = "count(*)" if fn == "count" else f"round({fn}({col})::numeric, 3)" if col in NUMERIC else None
        if expr:
            clean["aggregate"] = {"fn": fn, "column": col if fn != "count" else None, "group_by": group if group in COLUMNS else None}
            if clean["aggregate"]["group_by"]:
                g = clean["aggregate"]["group_by"]
                sql = f"select {g}, {expr} as value from planets{cond} group by {g} order by value desc nulls last limit 15"
            else:
                sql = f"select {expr} as value from planets{cond}"
            return sql, params, clean

    sort = plan.get("sort") or None
    order = " order by esi desc nulls last"
    if sort and sort.get("column") in COLUMNS:
        d = "desc" if str(sort.get("dir", "asc")).lower() == "desc" else "asc"
        order = f" order by {sort['column']} {d} nulls last"
        clean["sort"] = {"column": sort["column"], "dir": d}
    try:
        limit = max(1, min(25, int(plan.get("limit") or 10)))
    except (TypeError, ValueError):
        limit = 10
    clean["limit"] = limit
    sql = f"select {', '.join(PUBLIC)} from planets{cond}{order} limit {limit}"
    return sql, params, clean


def run_sql(sql: str, params: list) -> list[dict]:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def semantic_planets(question: str, k: int = 8) -> list[dict]:
    qvec = embeddings.to_pgvector(embeddings.embed_query(question))
    with cursor() as cur:
        cur.execute(f"select {', '.join(PUBLIC)} from planets where embedding is not null order by embedding <=> %s::vector limit %s", (qvec, k))
        return cur.fetchall()


def search_papers(query: str, k: int = 4, candidates: int = 20) -> list[dict]:
    qvec = embeddings.to_pgvector(embeddings.embed_query(query))
    with cursor() as cur:
        cur.execute("select * from paper_search(%s::vector, %s, %s)", (qvec, rag.keyword_query(query), candidates))
        rows = cur.fetchall()
    if not rows:
        return []
    scores = embeddings.rerank(query, [r["title"] + ". " + r["abstract"] for r in rows])
    for r, s in zip(rows, scores):
        r["rerank"] = round(s, 3)
    rows.sort(key=lambda r: r["rerank"], reverse=True)
    return [r for r in rows if r["rerank"] > rag.RERANK_MIN][:k]


def planet_line(p: dict) -> str:
    keys = ["name", "host", "dist_pc", "radius", "mass", "period", "eq_temp", "insolation", "star_teff", "size_class", "in_hz", "esi", "disc_year", "disc_method", "disc_facility"]
    return "TABLE ROW planets: " + "; ".join(f"{k}={p[k]}" for k in keys if k in p and p[k] is not None)


def paper_line(p: dict) -> str:
    return f"PAPER {p['title']} ({str(p.get('published') or '')[:4]}, arXiv {p['id']}): {p['abstract'][:1200]}"


ANSWER_SYSTEM = (
    "You are the science officer of the starship ODYSSEY. Answer using ONLY the numbered sources: TABLE ROW sources are "
    "exact values from the NASA Exoplanet Archive; PAPER sources are research abstracts. Cite sources like [1] or [2, 3]. "
    "Give numbers with units (light years = parsecs x 3.26). If the sources do not answer the question, say so. "
    "Under 170 words. Use short paragraphs or a short list."
)


class StarshipIn(BaseModel):
    question: str = Field(min_length=2, max_length=600)


@router.post("/starship/ask")
async def starship_ask(body: StarshipIn):
    async def events():
        q = body.question
        plan_raw = None
        if llm.configured():
            try:
                plan_raw = first_json(await llm.complete(PLAN_SYSTEM, q, max_tokens=500))
            except llm.LLMError as e:
                yield sse("note", f"Planner unavailable ({e}); using semantic search over planet cards.")
        rows, agg_rows, sql, clean = [], [], None, None
        if plan_raw:
            sql, params, clean = build_sql(plan_raw)
            try:
                result = await run_in_threadpool(run_sql, sql, params)
            except Exception as e:  # a bad plan should not crash the answer
                result = []
                yield sse("note", f"The query failed ({e.__class__.__name__}); falling back to semantic search.")
            if clean.get("aggregate"):
                agg_rows = result
            else:
                rows = result
            yield sse("plan", {"plan": clean, "sql": sql, "params": params, "count": len(result)})
        if not rows and not agg_rows:
            rows = await run_in_threadpool(semantic_planets, q, 6)
            yield sse("plan", {"plan": None, "sql": "semantic search over planet description cards", "params": [], "count": len(rows), "semantic": True})

        paper_q = (plan_raw or {}).get("paper_query") or q
        papers = await run_in_threadpool(search_papers, str(paper_q)[:200], 4)

        blocks = []
        if agg_rows:
            blocks.append("TABLE QUERY RESULT (aggregate " + str(clean["aggregate"]) + " with filters " + str(clean["filters"]) + "): " + "; ".join(str(dict(r)) for r in agg_rows))
        blocks += [planet_line(p) for p in rows[:12]]
        blocks += [paper_line(p) for p in papers]
        yield sse(
            "sources",
            {
                "aggregate": agg_rows,
                "planets": rows[:12],
                "papers": [{k: p[k] for k in ("id", "title", "published", "url", "rerank", "abstract")} for p in papers],
                "offset_papers": (1 if agg_rows else 0) + len(rows[:12]),
            },
        )
        if not llm.configured():
            yield sse("error", "Answers are off: LLM_API_KEY is not set on the server.")
            return
        try:
            async for t in llm.stream_chat(ANSWER_SYSTEM, f"Sources:\n{numbered(blocks)}\n\nQuestion: {q}", max_tokens=900):
                yield sse("token", t)
            yield sse("done", True)
        except llm.LLMError as e:
            yield sse("error", str(e))

    return stream(events())
