"""Station 4, Planet Lab: invent a planet, then three AI scientists debate whether it could
host life, each one only allowed to use retrieved evidence.

    your planet -> feature vector -> nearest REAL planets (analogs from the table)
                -> a search phrase built from its properties -> hybrid paper search + rerank
                -> Advocate argues for life, Skeptic rebuts, the Chair weighs both and scores
"""

from __future__ import annotations

import re
from functools import lru_cache

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from . import llm
from .db import cursor
from .planets import describe, distance, esi, feature_vector, in_hz, size_class, star_word
from .starship import paper_line, planet_line, search_papers
from .util import numbered, sse, stream

router = APIRouter(tags=["planet-lab"])


class PlanetIn(BaseModel):
    name: str = Field("Odyssey b", max_length=40)
    radius: float = Field(1.0, gt=0.2, le=25)        # Earth radii
    mass: float = Field(1.0, gt=0.01, le=5000)       # Earth masses
    period: float = Field(365.0, gt=0.2, le=100000)  # days
    insolation: float = Field(1.0, gt=0.001, le=5000)
    star_teff: float = Field(5772, ge=2300, le=12000)
    atmosphere: str = Field("unknown", max_length=40)
    water: str = Field("unknown", max_length=40)


def card(p: PlanetIn) -> dict:
    d = p.model_dump()
    d["host"] = "an invented star"
    d["eq_temp"] = round(255 * p.insolation**0.25)  # Earth-like reflectivity
    d["size_class"] = size_class(p.radius, p.mass)
    d["in_hz"] = in_hz(p.insolation)
    d["esi"] = esi(p.radius, p.insolation)
    d["density"] = round(p.mass / p.radius**3 * 5.51, 2)  # g/cm3, Earth 5.51
    d["description"] = describe(d) + f" Bulk density {d['density']} g/cm3. Atmosphere: {p.atmosphere}. Surface water: {p.water}."
    return d


@lru_cache(maxsize=1)
def _all() -> list[tuple[dict, list[float]]]:
    with cursor() as cur:
        cur.execute("select name, host, dist_pc, radius, mass, period, insolation, eq_temp, star_teff, size_class, in_hz, esi, disc_year, disc_method, disc_facility from planets")
        rows = cur.fetchall()
    return [(r, v) for r in rows if (v := feature_vector(r))]


def analogs(p: PlanetIn, k: int = 5) -> list[dict]:
    me = feature_vector(p.model_dump())
    ranked = sorted(_all(), key=lambda rv: distance(me, rv[1]))[:k]
    out = []
    for r, v in ranked:
        r = dict(r)
        r["distance"] = round(distance(me, v), 3)
        out.append(r)
    return out


def paper_query(c: dict) -> str:
    bits = [c["size_class"] or "rocky planet", "habitability"]
    star = star_word(c["star_teff"], None)
    if "red dwarf" in star:
        bits += ["M dwarf", "tidal locking", "stellar flares"]
    if c["in_hz"]:
        bits.append("habitable zone")
    elif c["insolation"] > 1.75:
        bits.append("runaway greenhouse")
    else:
        bits.append("snowball cold outer edge")
    if c["size_class"] in ("Sub-Neptune", "Neptune-like"):
        bits.append("water world hydrogen atmosphere")
    if c["water"] not in ("unknown", "none"):
        bits.append("ocean")
    return " ".join(bits)


@router.post("/lab/similar")
async def similar(p: PlanetIn):
    c = card(p)
    return {"planet": c, "analogs": await run_in_threadpool(analogs, p, 6)}


SCIENTISTS = [
    (
        "advocate",
        "Dr. Lyra Vega",
        "Astrobiologist (optimist)",
        "You are Dr. Lyra Vega, an astrobiologist arguing that this invented planet COULD support life. "
        "Use only the numbered evidence and the planet card; cite sources like [2]. Compare with the real analog planets. "
        "Make 3 sharp points in under 110 words. Do not invent studies.",
    ),
    (
        "skeptic",
        "Dr. Tomas Okafor",
        "Planetary scientist (skeptic)",
        "You are Dr. Tomas Okafor, a planetary scientist arguing that this planet is probably NOT habitable. "
        "Rebut Dr. Vega's points directly, using only the numbered evidence and the planet card; cite like [3]. "
        "3 sharp points, under 110 words. Do not invent studies.",
    ),
    (
        "judge",
        "Chair",
        "Review panel chair",
        "You chair the review panel. Weigh both arguments against the evidence: say which points were well supported and "
        "which were not, citing sources. Under 110 words. End with exactly one line: 'Habitability score: N/100' where N is "
        "your honest estimate.",
    ),
]


@router.post("/lab/debate")
async def debate(p: PlanetIn):
    async def events():
        c = card(p)
        near = await run_in_threadpool(analogs, p, 4)
        q = paper_query(c)
        papers = await run_in_threadpool(search_papers, q, 5, 30)
        blocks = [paper_line(x) for x in papers] + [planet_line(x) + " (real analog)" for x in near]
        yield sse(
            "sources",
            {
                "planet": c,
                "query": q,
                "papers": [{k: x[k] for k in ("id", "title", "published", "url", "rerank", "abstract")} for x in papers],
                "analogs": near,
            },
        )
        if not llm.configured():
            yield sse("error", "Answers are off: LLM_API_KEY is not set on the server.")
            return
        evidence = f"Planet card: {c['description']}\n\nEvidence:\n{numbered(blocks)}"
        transcript = ""
        for role, name, title, system in SCIENTISTS:
            yield sse("turn", {"role": role, "name": name, "title": title})
            text = ""
            try:
                async for t in llm.stream_chat(system, f"{evidence}\n\nDebate so far:\n{transcript or '(you speak first)'}", temperature=0.5, max_tokens=700):
                    text += t
                    yield sse("token", {"role": role, "t": t})
            except llm.LLMError as e:
                yield sse("error", str(e))
                return
            transcript += f"\n{name}: {text}\n"
            if role == "judge":
                m = re.search(r"score:\s*(\d{1,3})\s*/\s*100", text, re.I)
                if m:
                    yield sse("score", min(100, int(m.group(1))))
        yield sse("done", True)

    return stream(events())
