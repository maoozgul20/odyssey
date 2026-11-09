"""Decision points: at each crisis the player chooses, then RAG retrieves what NASA
actually decided (only from the transcript around that moment) and explains it."""

from __future__ import annotations

import json
from functools import lru_cache

from fastapi.concurrency import run_in_threadpool

from . import llm, rag
from .config import ROOT
from .transcript import parse_met


@lru_cache(maxsize=1)
def load() -> list[dict]:
    items = json.loads((ROOT / "data" / "decisions.json").read_text(encoding="utf-8"))
    for d in items:
        d["decide_met"] = parse_met(d["decide_at"])
        d["evidence"]["from_met"] = parse_met(d["evidence"]["from"])
        d["evidence"]["to_met"] = parse_met(d["evidence"]["to"])
    return items


def public(d: dict) -> dict:
    """What the player sees before choosing (no answer)."""
    return {k: d[k] for k in ("id", "title", "decide_at", "decide_met", "question", "options")}


def get(decision_id: str) -> dict | None:
    return next((d for d in load() if d["id"] == decision_id), None)


EXPLAIN_SYSTEM = (
    "You are FLIGHT, explaining a real Apollo 13 decision to a trainee flight director. Use ONLY the numbered "
    "transcript excerpts. In 3 to 4 sentences: say what Mission Control actually decided and when, quote or "
    "paraphrase the key radio line, and explain why it mattered. Cite excerpt numbers like [1]. If the trainee chose "
    "differently, say briefly what the risk of their choice would have been, without inventing facts."
)


async def judge(decision_id: str, choice: str) -> dict:
    d = get(decision_id)
    if d is None:
        raise KeyError(decision_id)
    ev = d["evidence"]
    # start a little early so a conversation that began just before the window still counts
    hits = await run_in_threadpool(
        rag.retrieve, ev["query"], 4, 30, "a13", ev["to_met"], ev["from_met"] - 900
    )
    correct = choice == d["nasa"]
    picked = next((o["text"] for o in d["options"] if o["id"] == choice), "no choice")
    nasa = next(o["text"] for o in d["options"] if o["id"] == d["nasa"])
    explanation = ""
    if llm.configured() and hits:
        try:
            explanation = await llm.complete(
                EXPLAIN_SYSTEM,
                rag.user_prompt(
                    f"Decision: {d['question']}\nThe trainee chose: {picked}\nMission Control's actual decision: {nasa}\n"
                    "Explain the real decision.",
                    hits,
                ),
                max_tokens=700,
            )
        except llm.LLMError as e:
            explanation = f"(FLIGHT could not explain: {e})"
    return {
        "id": d["id"],
        "correct": correct,
        "choice": choice,
        "nasa_choice": d["nasa"],
        "nasa_text": nasa,
        "explanation": explanation,
        "evidence": [h.as_dict() for h in hits],
    }
