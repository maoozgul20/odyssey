"""Measure retrieval quality with a test set whose answers are known.

For every question in data/eval_set.json we know the mission time of the line that
answers it. A retrieved chunk is a "hit" if it covers that time. Four retrieval
methods are compared on the same questions:

    semantic         meaning only (pgvector cosine)
    keyword          exact words only (Postgres full-text)
    hybrid           both, fused with Reciprocal Rank Fusion
    hybrid+rerank    hybrid, then the cross-encoder reorders the top 30

Metrics: Hit@1, Hit@3, Hit@5 (is a correct chunk in the top k?) and MRR@10 (1 / rank of
the first correct chunk, averaged). For the questions the transcript cannot answer we
check that the coverage signal says "not covered". With --answers, FLIGHT also writes an
answer for each question and a judge model scores its faithfulness to the excerpts.
"""

from __future__ import annotations

import json
import time

from . import embeddings, rag
from .config import ROOT
from .db import cursor
from .transcript import parse_met

METHODS = ["semantic", "keyword", "hybrid", "hybrid+rerank"]
TOLERANCE = 60  # seconds either side of the expected line
OUT = ROOT / "data" / "eval_results.json"


def load_set() -> list[dict]:
    items = json.loads((ROOT / "data" / "eval_set.json").read_text(encoding="utf-8"))
    for it in items:
        it["expect_met"] = [parse_met(t) for t in it["expect"]]
    return items


def ranked(question: str, method: str, k: int = 10) -> list[dict]:
    qvec = embeddings.to_pgvector(embeddings.embed_query(question))
    kw = rag.keyword_query(question)
    weights = {"semantic": (1.0, 0.0), "keyword": (0.0, 1.0)}.get(method, (1.0, 1.0))
    with cursor() as cur:
        cur.execute(
            "select * from hybrid_search(%s::vector, %s, %s, 'a13', null, null, %s, %s)",
            (qvec, "" if method == "semantic" else kw, 30, *weights),
        )
        rows = cur.fetchall()
    if method == "keyword":
        rows = [r for r in rows if r["keyword_rank"] is not None]
    if method == "hybrid+rerank" and rows:
        scores = embeddings.rerank(question, [r["content"] for r in rows])
        for r, s in zip(rows, scores):
            r["rerank"] = s
        rows.sort(key=lambda r: r["rerank"], reverse=True)
    return rows[:k]


def is_hit(row: dict, expect: list[int]) -> bool:
    return any(row["start_met"] - TOLERANCE <= t <= row["end_met"] + TOLERANCE for t in expect)


def run(with_answers: bool = False, progress=print) -> dict:
    items = load_set()
    answerable = [it for it in items if it["expect_met"]]
    unanswerable = [it for it in items if not it["expect_met"]]
    per_question = []
    totals = {m: {"hit1": 0, "hit3": 0, "hit5": 0, "mrr": 0.0} for m in METHODS}
    t0 = time.time()

    for i, it in enumerate(answerable, 1):
        row = {"q": it["q"], "expect": it["expect"], "ranks": {}}
        for m in METHODS:
            res = ranked(it["q"], m)
            rank = next((j for j, r in enumerate(res, 1) if is_hit(r, it["expect_met"])), None)
            row["ranks"][m] = rank
            t = totals[m]
            t["hit1"] += rank == 1
            t["hit3"] += rank is not None and rank <= 3
            t["hit5"] += rank is not None and rank <= 5
            t["mrr"] += 1 / rank if rank else 0
        per_question.append(row)
        progress(f"  {i}/{len(answerable)} {it['q'][:60]}")

    n = len(answerable)
    summary = {
        m: {
            "hit@1": round(t["hit1"] / n, 3),
            "hit@3": round(t["hit3"] / n, 3),
            "hit@5": round(t["hit5"] / n, 3),
            "mrr@10": round(t["mrr"] / n, 3),
        }
        for m, t in totals.items()
    }

    # coverage: does the system know when it does NOT know?
    coverage = []
    for it in answerable + unanswerable:
        hits = rag.retrieve(it["q"], k=5)
        coverage.append({"q": it["q"], "answerable": bool(it["expect_met"]), "covered": rag.covered(hits), "top_rerank": round(hits[0].rerank, 3) if hits else None})
    correct_cov = sum(c["covered"] == c["answerable"] for c in coverage)

    result = {
        "run_at": time.strftime("%Y-%m-%d %H:%M"),
        "seconds": round(time.time() - t0, 1),
        "questions": n,
        "unanswerable": len(unanswerable),
        "methods": METHODS,
        "summary": summary,
        "coverage_accuracy": round(correct_cov / len(coverage), 3),
        "coverage": coverage,
        "per_question": per_question,
    }
    if with_answers:
        result["answers"] = judge_answers(answerable, progress)
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


JUDGE_SYSTEM = (
    "You check an answer against the transcript excerpts it was given. Reply with a single number from 0 to 1: "
    "the fraction of the answer's factual claims that are directly supported by the excerpts. Reply with the number only."
)


def judge_answers(items: list[dict], progress=print) -> dict:
    """Faithfulness (claims supported by the excerpts) and keyword correctness of FLIGHT's answers."""
    import asyncio

    from . import llm

    async def one(it):
        hits = rag.retrieve(it["q"], k=5)
        answer = await llm.complete(rag.system_prompt("flight"), rag.user_prompt(it["q"], hits), max_tokens=500)
        verdict = await llm.complete(JUDGE_SYSTEM, rag.user_prompt(f"Answer to check:\n{answer}", hits), max_tokens=200)
        try:
            faith = max(0.0, min(1.0, float(verdict.strip().split()[0])))
        except (ValueError, IndexError):
            faith = None
        has_kw = all(k.lower() in answer.lower() for k in it["keywords"]) if it["keywords"] else None
        return {"q": it["q"], "answer": answer, "faithfulness": faith, "keywords_found": has_kw}

    async def all_():
        out = []
        for i, it in enumerate(items, 1):
            out.append(await one(it))
            progress(f"  answer {i}/{len(items)}")
            await asyncio.sleep(2.5)  # stay well under the free-tier rate limit
        return out

    rows = asyncio.run(all_())
    faiths = [r["faithfulness"] for r in rows if r["faithfulness"] is not None]
    kws = [r["keywords_found"] for r in rows if r["keywords_found"] is not None]
    return {
        "faithfulness": round(sum(faiths) / len(faiths), 3) if faiths else None,
        "keyword_accuracy": round(sum(kws) / len(kws), 3) if kws else None,
        "rows": rows,
    }
