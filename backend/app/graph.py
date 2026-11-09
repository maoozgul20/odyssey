"""Station 5, the Knowledge Map: GraphRAG over a graph that links all the stations.

Plain RAG finds passages that look like the question. GraphRAG first finds the THINGS the
question is about, walks the graph to what they are connected to, and then retrieves the
evidence stored on those nodes and edges. That answers questions that span sources, such
as "How is the CO2 problem on Apollo 13 connected to exoplanet research?".

    question -> entity linking (vector search over node descriptions + name matching)
             -> 1-hop expansion along the strongest edges
             -> evidence from those nodes and edges (radio chunks, planet rows, papers, pictures)
             -> rerank -> graph facts + numbered evidence -> cited answer
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from . import embeddings, llm
from .db import cursor
from .transcript import format_met
from .util import numbered, sse, stream

router = APIRouter(tags=["knowledge-map"])


@router.get("/graph")
def graph(min_weight: float = 1):
    with cursor() as cur:
        cur.execute("select id, label, kind, station, weight from kg_nodes")
        nodes = cur.fetchall()
        cur.execute("select src, dst, relation, weight from kg_edges where weight >= %s", (min_weight,))
        edges = cur.fetchall()
    if not nodes:
        raise HTTPException(503, "The graph is empty. Run scripts/build_graph.py")
    return {"nodes": nodes, "edges": edges}


def resolve(evidence: list[dict], limit: int = 40) -> list[dict]:
    """Turn evidence pointers into text: radio chunks, planet cards, abstracts, picture captions."""
    by = {"chunk": [], "planet": [], "paper": [], "image": []}
    for e in evidence[:limit]:
        if e.get("type") in by and e["id"] not in by[e["type"]]:
            by[e["type"]].append(e["id"])
    out = []
    with cursor() as cur:
        if by["chunk"]:
            cur.execute("select id, start_met, end_met, content from chunks where id = any(%s)", (by["chunk"],))
            for r in cur.fetchall():
                out.append({"type": "chunk", "id": r["id"], "title": f"Apollo 13 radio, {format_met(r['start_met'])}", "text": r["content"], "start_met": r["start_met"]})
        if by["planet"]:
            cur.execute("select name, description from planets where name = any(%s)", (by["planet"],))
            out += [{"type": "planet", "id": r["name"], "title": f"Planet {r['name']}", "text": r["description"]} for r in cur.fetchall()]
        if by["paper"]:
            cur.execute("select id, title, abstract, url from papers where id = any(%s)", (by["paper"],))
            out += [{"type": "paper", "id": r["id"], "title": r["title"], "text": r["abstract"], "url": r["url"]} for r in cur.fetchall()]
        if by["image"]:
            cur.execute("select nasa_id, title, description, thumb_url from mars_images where nasa_id = any(%s)", (by["image"],))
            out += [{"type": "image", "id": r["nasa_id"], "title": r["title"], "text": r["description"], "thumb_url": r["thumb_url"]} for r in cur.fetchall()]
    return out


@router.get("/graph/node/{node_id:path}")
def node(node_id: str):
    with cursor() as cur:
        cur.execute("select id, label, kind, station, description, weight, evidence from kg_nodes where id = %s", (node_id,))
        n = cur.fetchone()
        if not n:
            raise HTTPException(404, "No such node")
        cur.execute(
            """select e.src, e.dst, e.relation, e.weight, n.label, n.kind, n.station
               from kg_edges e join kg_nodes n on n.id = case when e.src = %s then e.dst else e.src end
               where e.src = %s or e.dst = %s order by e.weight desc limit 30""",
            (node_id, node_id, node_id),
        )
        n["neighbors"] = cur.fetchall()
    n["evidence"] = resolve(n["evidence"], 8)
    for e in n["evidence"]:
        e["text"] = e["text"][:700]
    return n


def link_entities(question: str, k: int = 5) -> list[dict]:
    qvec = embeddings.to_pgvector(embeddings.embed_query(question))
    with cursor() as cur:
        cur.execute(
            "select id, label, kind, station, description, evidence, 1 - (embedding <=> %s::vector) as sim from kg_nodes order by embedding <=> %s::vector limit %s",
            (qvec, qvec, k),
        )
        seeds = cur.fetchall()
        # exact name matches win even if the vectors disagree ("TRAPPIST-1", "Aquarius")
        cur.execute(
            """select id, label, kind, station, description, evidence, 1.0 as sim from kg_nodes
               where (length(label) >= 4 and position(lower(split_part(label, ' (', 1)) in lower(%s)) > 0)
                  or exists (select 1 from unnest(aliases) a where length(a) >= 3 and lower(%s) ~ ('\m' || a || '\M'))
               order by weight desc limit 4""",
            (question, question),
        )
        named = cur.fetchall()
    seen, out = set(), []
    for s in named + seeds:
        if s["id"] not in seen:
            seen.add(s["id"])
            out.append(s)
    return out[: k + 2]


def expand(seed_ids: list[str], per_seed: int = 5) -> tuple[list[dict], list[dict]]:
    with cursor() as cur:
        cur.execute(
            """select * from (
                 select e.src, e.dst, e.relation, e.weight, e.evidence,
                        row_number() over (partition by s.id order by e.weight desc) as r
                 from unnest(%s::text[]) as s(id) join kg_edges e on e.src = s.id or e.dst = s.id
               ) t where r <= %s""",
            (seed_ids, per_seed),
        )
        edges = list({(e["src"], e["dst"], e["relation"]): e for e in cur.fetchall()}.values())
        # plus every edge that directly joins two of the seeds, however weak
        cur.execute("select src, dst, relation, weight, evidence from kg_edges where src = any(%s) and dst = any(%s)", (seed_ids, seed_ids))
        have = {(e["src"], e["dst"], e["relation"]) for e in edges}
        edges += [e for e in cur.fetchall() if (e["src"], e["dst"], e["relation"]) not in have]
        ids = list({e["src"] for e in edges} | {e["dst"] for e in edges} | set(seed_ids))
        cur.execute("select id, label, kind, station, description, evidence from kg_nodes where id = any(%s)", (ids,))
        nodes = cur.fetchall()
    return nodes, edges


ANSWER_SYSTEM = (
    "You are the ODYSSEY knowledge officer. You get GRAPH FACTS (how things are connected across Apollo 13, exoplanets, "
    "research papers and Mars) and numbered EVIDENCE. Answer the question by following the connections; cite evidence "
    "like [2]. Say which connections come from the graph. Use only what is given; if it is not enough, say what is missing. "
    "Under 170 words."
)


class GraphAskIn(BaseModel):
    question: str = Field(min_length=2, max_length=600)


@router.post("/graph/ask")
async def graph_ask(body: GraphAskIn):
    async def events():
        q = body.question
        seeds = await run_in_threadpool(link_entities, q)
        if not seeds:
            yield sse("error", "The graph is empty. Run scripts/build_graph.py")
            return
        nodes, edges = await run_in_threadpool(expand, [s["id"] for s in seeds])
        label = {n["id"]: n["label"] for n in nodes}
        yield sse("graph", {"seeds": [s["id"] for s in seeds], "nodes": [n["id"] for n in nodes], "edges": [[e["src"], e["dst"]] for e in edges]})

        # edges between two things the question is about matter most, then edges of named things
        seed_ids = {s["id"] for s in seeds}
        named = {s["id"] for s in seeds if s["sim"] >= 0.999}

        def rank(e):
            both = e["src"] in seed_ids and e["dst"] in seed_ids
            return (not both, not ({e["src"], e["dst"]} & named), -e["weight"])

        edges.sort(key=rank)
        pointers = [p for s in seeds for p in s["evidence"][:4]] + [p for e in edges for p in e["evidence"][:2]]
        cands = await run_in_threadpool(resolve, pointers, 40)
        if cands:
            scores = await run_in_threadpool(embeddings.rerank, q, [c["title"] + ". " + c["text"][:900] for c in cands])
            for c, s in zip(cands, scores):
                c["rerank"] = round(s, 3)
            cands.sort(key=lambda c: c["rerank"], reverse=True)
        ev = cands[:6]
        for c in ev:
            c["text"] = c["text"][:900]
        facts = [f"{label.get(e['src'], e['src'])} --{e['relation']} (x{e['weight']:g})--> {label.get(e['dst'], e['dst'])}" for e in edges[:18]]
        yield sse("sources", {"seeds": [{"id": s["id"], "label": s["label"], "kind": s["kind"]} for s in seeds], "facts": facts, "evidence": ev})
        if not llm.configured():
            yield sse("error", "Answers are off: LLM_API_KEY is not set on the server.")
            return
        prompt = (
            "GRAPH FACTS:\n" + "\n".join(f"- {f}" for f in facts)
            + "\n\nENTITIES:\n" + "\n".join(f"- {s['label']} ({s['kind']}): {s['description'][:200]}" for s in seeds)
            + "\n\nEVIDENCE:\n" + numbered([f"{c['title']}: {c['text']}" for c in ev])
            + f"\n\nQuestion: {q}"
        )
        try:
            async for t in llm.stream_chat(ANSWER_SYSTEM, prompt, max_tokens=900):
                yield sse("token", t)
            yield sse("done", True)
        except llm.LLMError as e:
            yield sse("error", str(e))

    return stream(events())
