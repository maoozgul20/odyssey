"""Station 2, Mars: multimodal RAG over NASA's Mars pictures.

CLIP turns pictures and words into vectors in the SAME space, so you can search pictures
with words ("blue sunset"), with another picture ("more like this") or with your own photo.
Captions add a keyword ranking (fused with RRF), and a briefing is then written only from
the captions of the pictures that were retrieved.
"""

from __future__ import annotations

import io

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from . import embeddings, llm, rag
from .db import cursor
from .util import numbered, sse, stream

router = APIRouter(tags=["mars"])
COLS = "nasa_id, title, description, date_created, center, keywords, thumb_url, page_url"


class MarsIn(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    k: int = Field(24, ge=1, le=60)


def text_search(query: str, k: int) -> list[dict]:
    v = embeddings.to_pgvector(embeddings.clip_text(query))
    with cursor() as cur:
        cur.execute("select * from mars_search(%s::vector, %s, %s)", (v, rag.keyword_query(query), k))
        return cur.fetchall()


def vector_search(vec: str, k: int, exclude: str | None = None) -> list[dict]:
    with cursor() as cur:
        cur.execute(
            f"select {COLS}, 1 - (clip <=> %s::vector) as similarity from mars_images where clip is not null and nasa_id is distinct from %s order by clip <=> %s::vector limit %s",
            (vec, exclude, vec, k),
        )
        return cur.fetchall()


@router.get("/mars/gallery")
def gallery(n: int = 36):
    with cursor() as cur:
        cur.execute(f"select {COLS} from mars_images order by md5(nasa_id || current_date::text) limit %s", (min(n, 80),))
        rows = cur.fetchall()
        cur.execute("select count(*) as n from mars_images")
        total = cur.fetchone()["n"]
    return {"total": total, "images": rows}


@router.post("/mars/search")
async def search(body: MarsIn):
    return {"query": body.query, "images": await run_in_threadpool(text_search, body.query, body.k)}


@router.get("/mars/similar/{nasa_id}")
def similar(nasa_id: str, k: int = 24):
    with cursor() as cur:
        cur.execute(f"select {COLS}, clip::text as vec from mars_images where nasa_id = %s", (nasa_id,))
        me = cur.fetchone()
    if not me:
        raise HTTPException(404, "No such picture")
    vec = me.pop("vec")
    return {"source": me, "images": vector_search(vec, min(k, 60), nasa_id)}


@router.post("/mars/upload")
async def upload(file: UploadFile = File(...), k: int = 24):
    """Search with your own picture: it is embedded with CLIP and never stored."""
    data = await file.read()
    if len(data) > 8_000_000:
        raise HTTPException(413, "Please use a picture smaller than 8 MB.")
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise HTTPException(400, "That file is not a picture we can read.")
    vec = (await run_in_threadpool(embeddings.clip_images, [img]))[0]
    return {"images": await run_in_threadpool(vector_search, embeddings.to_pgvector(vec), min(k, 60))}


BRIEF_SYSTEM = (
    "You are the ODYSSEY Mars science officer. Write a short briefing that answers the question using ONLY the numbered "
    "picture captions from NASA. Cite pictures like [1]. Mention what the pictures show, where and which mission took them. "
    "If the captions do not answer it, say so. Under 150 words."
)


class BriefIn(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    ids: list[str] | None = None


@router.post("/mars/brief")
async def brief(body: BriefIn):
    async def events():
        if body.ids:
            with cursor() as cur:
                cur.execute(f"select {COLS} from mars_images where nasa_id = any(%s)", (body.ids[:8],))
                imgs = cur.fetchall()
        else:
            imgs = await run_in_threadpool(text_search, body.query, 12)
        # rerank captions so the briefing uses the pictures whose words best fit the question
        if imgs:
            scores = await run_in_threadpool(embeddings.rerank, body.query, [i["title"] + ". " + i["description"][:800] for i in imgs])
            for i, s in zip(imgs, scores):
                i["rerank"] = round(s, 3)
            imgs.sort(key=lambda i: i["rerank"], reverse=True)
        imgs = imgs[:6]
        yield sse("sources", {"images": imgs})
        if not llm.configured():
            yield sse("error", "Answers are off: LLM_API_KEY is not set on the server.")
            return
        blocks = [f"PICTURE {i['title']} ({i.get('date_created') or 'undated'}, {i.get('center') or 'NASA'}): {i['description'][:900]}" for i in imgs]
        try:
            async for t in llm.stream_chat(BRIEF_SYSTEM, f"Captions:\n{numbered(blocks)}\n\nQuestion: {body.query}", max_tokens=700):
                yield sse("token", t)
            yield sse("done", True)
        except llm.LLMError as e:
            yield sse("error", str(e))

    return stream(events())
