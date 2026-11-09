"""The RAG pipeline: hybrid retrieval -> reranking -> grounded prompt.

    question
      -> embed (bge-small)                 meaning
      -> keyword query (OR of the words)   exact words such as "LM", "O2", "Aquarius"
      -> hybrid_search() in Postgres       both rankings fused (RRF), optional time filter
      -> cross-encoder rerank              best k of ~30 candidates
      -> prompt with numbered excerpts     the model may only use these
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from . import embeddings
from .db import cursor
from .transcript import format_met

# A cross-encoder score above this means the passage really answers the question.
# Calibrate it with the evaluation set (phase 5); 0.0 is the model's natural midpoint.
RERANK_COVERAGE = 0.0

STOP = set(
    """a an the and or but if then of to in on at by for with from as is are was were be been being do does did
    what which who whom whose when where why how can could should would will shall may might must this that these
    those it its i you he she we they me him her us them my your our their there here about into over under up down
    out off again so than too very just not no yes tell me please said say""".split()
)


def keyword_query(question: str) -> str:
    """'What happened to the O2 tank?' -> 'happened | o2 | tank' (safe for to_tsquery)."""
    words = [w for w in re.findall(r"[a-z0-9]+", question.lower()) if len(w) > 1 and w not in STOP]
    return " | ".join(dict.fromkeys(words))[:500]


@dataclass
class Hit:
    id: int
    content: str
    start_met: int
    end_met: int
    act: str | None
    speakers: list[str]
    source: str
    similarity: float | None
    fused: float
    rerank: float

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "content": self.content,
            "start_met": self.start_met,
            "end_met": self.end_met,
            "start": format_met(self.start_met),
            "end": format_met(self.end_met),
            "act": self.act,
            "speakers": self.speakers,
            "source": self.source,
            "similarity": None if self.similarity is None else round(self.similarity, 4),
            "fused": round(self.fused, 5),
            "rerank": round(self.rerank, 4),
        }


def retrieve(
    question: str,
    k: int = 5,
    candidates: int = 30,
    mission: str = "a13",
    max_met: int | None = None,
    min_met: int | None = None,
    use_rerank: bool = True,
) -> list[Hit]:
    qvec = embeddings.to_pgvector(embeddings.embed_query(question))
    with cursor() as cur:
        cur.execute(
            "select * from hybrid_search(%s::vector, %s, %s, %s, %s, %s)",
            (qvec, keyword_query(question), candidates, mission, max_met, min_met),
        )
        rows = cur.fetchall()
    hits = [
        Hit(
            id=r["id"],
            content=r["content"],
            start_met=r["start_met"],
            end_met=r["end_met"],
            act=r["act"],
            speakers=r["speakers"] or [],
            source=r["source"],
            similarity=r["similarity"],
            fused=r["score"],
            rerank=0.0,
        )
        for r in rows
    ]
    if use_rerank and hits:
        for h, s in zip(hits, embeddings.rerank(question, [h.content for h in hits])):
            h.rerank = s
        hits.sort(key=lambda h: h.rerank, reverse=True)
    return hits[:k]


def recent_context(max_met: int, mission: str = "a13", n: int = 2) -> list[Hit]:
    """The latest chunks before a moment: what a crew member just heard on the radio."""
    with cursor() as cur:
        cur.execute(
            """select id, content, start_met, end_met, act, speakers, source from chunks
               where mission_id = %s and end_met <= %s order by end_met desc limit %s""",
            (mission, max_met, n),
        )
        rows = cur.fetchall()
    return [
        Hit(r["id"], r["content"], r["start_met"], r["end_met"], r["act"], r["speakers"] or [], r["source"], None, 0.0, 99.0)
        for r in reversed(rows)
    ]


def covered(hits: list[Hit]) -> bool:
    return any(h.rerank >= RERANK_COVERAGE for h in hits)


CREW = {
    "CDR": ("Jim Lovell", "the Commander"),
    "LMP": ("Fred Haise", "the Lunar Module Pilot"),
    "CMP": ("Jack Swigert", "the Command Module Pilot"),
    "CC": ("CapCom", "the Capsule Communicator in Mission Control, Houston"),
}


def system_prompt(mode: str, persona: str = "CDR", max_met: int | None = None) -> str:
    if mode == "crew":
        name, role = CREW.get(persona, CREW["CDR"])
        when = format_met(max_met) if max_met is not None else "the end of the mission"
        return (
            f"You are {name}, {role} of Apollo 13, speaking on the radio at mission elapsed time {when}. "
            "Stay in character: first person, short, calm, in the clipped radio style of 1970. "
            "Use ONLY facts found in the transcript excerpts. All of them were said before this moment; "
            "you know nothing that happens later, so never mention later events. "
            "If the excerpts do not cover the question, say in character that you can't confirm that right now. "
            "Keep each reply under 80 words and put the excerpt number in brackets, like [2], after each fact."
        )
    return (
        "You are FLIGHT, the AI flight historian of ODYSSEY. Answer questions about the Apollo 13 mission using ONLY "
        "the numbered transcript excerpts. Cite the excerpt number in brackets, like [1], after each fact, and give "
        "mission times (DD:HH:MM:SS) when they help. If the excerpts do not contain the answer, say "
        '"I can\'t find that in the Apollo 13 transcript." Do not use outside knowledge. Be clear and concise.'
    )


def user_prompt(question: str, hits: list[Hit]) -> str:
    parts = []
    for i, h in enumerate(hits, start=1):
        parts.append(f"[{i}] ({format_met(h.start_met)} to {format_met(h.end_met)}, {h.act or 'mission'})\n{h.content}")
    return "Transcript excerpts:\n\n" + "\n\n".join(parts) + f"\n\nQuestion: {question}"
