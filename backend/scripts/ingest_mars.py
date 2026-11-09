"""Station 2: load NASA's Mars pictures and index them with CLIP.

Run from the backend folder:   python scripts/ingest_mars.py

  1. search the NASA Image and Video Library for 16 Mars topics (no API key needed)
  2. download each small preview picture (cached in data/raw/mars/)
  3. turn every picture into a CLIP vector (512 numbers). CLIP puts pictures and words
     in the same space, so "dust devil" can find a dust devil photo whose caption never says so
  4. replace the mars_images table in Supabase

The first run downloads the CLIP model (about 350 MB) and about 1,500 pictures: 5 to 10 minutes.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import embeddings  # noqa: E402
from app.db import connect  # noqa: E402

API = "https://images-api.nasa.gov/search"
RAW = ROOT / "data" / "raw" / "mars"
QUERIES = [
    "Mars Perseverance rover", "Mars Curiosity rover", "Jezero crater", "Gale crater Mars", "Mars dust storm",
    "Mars dust devil", "Olympus Mons", "Valles Marineris", "Mars sand dunes", "Ingenuity helicopter Mars",
    "HiRISE Mars", "Mars polar ice cap", "Mars sunset", "Mars rock outcrop", "Mars Opportunity rover", "Mars layered terrain",
]
PAGES = 1  # 100 results per query per page


def search(q: str, page: int) -> list[dict]:
    url = API + "?" + urllib.parse.urlencode({"q": q, "media_type": "image", "page": page, "page_size": 100})
    with urllib.request.urlopen(url, timeout=60) as r:
        items = json.load(r)["collection"]["items"]
    out = []
    for it in items:
        d = (it.get("data") or [{}])[0]
        thumb = next((l["href"] for l in it.get("links", []) if l.get("rel") == "preview"), None)
        if not thumb or not d.get("nasa_id"):
            continue
        text = (d.get("title", "") + " " + d.get("description", "")).lower()
        if "mars" not in text and "martian" not in text and "jezero" not in text and "gale" not in text:
            continue  # the library also returns Mars Hill, Mars candy bars, ...
        out.append(
            {
                "nasa_id": d["nasa_id"],
                "title": d.get("title", "").strip()[:300],
                "description": " ".join((d.get("description") or "").split())[:4000],
                "date_created": (d.get("date_created") or "")[:10] or None,
                "center": d.get("center"),
                "keywords": [k.strip() for k in (d.get("keywords") or []) if k.strip()][:20],
                "thumb_url": thumb.replace(" ", "%20"),
                "page_url": f"https://images.nasa.gov/details/{urllib.parse.quote(d['nasa_id'])}",
            }
        )
    return out


def fetch_thumb(img: dict) -> Path | None:
    from PIL import Image

    path = RAW / "thumbs" / (img["nasa_id"].replace("/", "_") + ".jpg")
    try:
        if not (path.exists() and path.stat().st_size > 0):
            with urllib.request.urlopen(img["thumb_url"], timeout=60) as r:
                path.write_bytes(r.read())
        with Image.open(path) as im:  # skip broken downloads
            im.verify()
        return path
    except Exception:
        path.unlink(missing_ok=True)
        return None


def main():
    t0 = time.time()
    (RAW / "thumbs").mkdir(parents=True, exist_ok=True)
    meta = RAW / "images.json"
    if meta.exists():
        images = json.loads(meta.read_text(encoding="utf-8"))
    else:
        found: dict[str, dict] = {}
        for i, q in enumerate(QUERIES, 1):
            for page in range(1, PAGES + 1):
                try:
                    for img in search(q, page):
                        found.setdefault(img["nasa_id"], img)
                except Exception as e:
                    print(f"    skipped {q!r} page {page}: {e.__class__.__name__}")
            print(f"  {i}/{len(QUERIES)} {q}: {len(found)} pictures so far")
        images = list(found.values())
        meta.write_text(json.dumps(images), encoding="utf-8")

    print(f"Downloading {len(images):,} preview pictures…")
    with ThreadPoolExecutor(8) as pool:
        paths = list(pool.map(fetch_thumb, images))
    keep = [(img, p) for img, p in zip(images, paths) if p]
    print(f"{len(keep):,} pictures ready. Turning them into CLIP vectors (a few minutes)…")

    vecs = embeddings.clip_images([str(p) for _, p in keep])
    with connect() as conn, conn.cursor() as cur:
        cur.execute("delete from mars_images")
        cols = ["nasa_id", "title", "description", "date_created", "center", "keywords", "thumb_url", "page_url"]
        with cur.copy(f"copy mars_images ({', '.join(cols)}, keyword_text, clip) from stdin") as cp:
            for (img, _), v in zip(keep, vecs):
                cp.write_row([img[c] for c in cols] + [" ".join(img["keywords"]), embeddings.to_pgvector(v)])
        conn.commit()
    print(f"Done in {time.time() - t0:.0f} s.")


if __name__ == "__main__":
    main()
