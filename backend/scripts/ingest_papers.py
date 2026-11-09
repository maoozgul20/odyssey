"""Stations 3 and 4: load research paper abstracts from arXiv.

Run from the backend folder (after ingest_exoplanets.py):   python scripts/ingest_papers.py

  1. ask the arXiv API for the most relevant papers on 14 exoplanet and Mars topics
  2. note which star systems from the planets table each paper names
  3. embed title + abstract and replace the papers table in Supabase

arXiv asks for one request every 3 seconds, so this takes about 2 minutes.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import embeddings  # noqa: E402
from app.db import connect  # noqa: E402

API = "http://export.arxiv.org/api/query"
PER_TOPIC = 100
RAW = ROOT / "data" / "raw" / "papers.json"
NS = {"a": "http://www.w3.org/2005/Atom"}

TOPICS = {
    "Habitable zone planets": 'abs:"habitable zone" AND cat:astro-ph.EP',
    "Exoplanet atmospheres (JWST)": 'abs:"JWST" AND abs:atmosphere AND cat:astro-ph.EP',
    "TRAPPIST-1 system": 'abs:"TRAPPIST-1"',
    "Proxima Centauri b": 'abs:"Proxima Centauri b"',
    "Super-Earths and sub-Neptunes": 'abs:"sub-Neptune" AND cat:astro-ph.EP',
    "Hot Jupiters": 'abs:"hot Jupiter" AND cat:astro-ph.EP',
    "M dwarf planets and flares": 'abs:"M dwarf" AND abs:habitability',
    "Biosignatures": 'abs:biosignature AND cat:astro-ph.EP',
    "Ocean worlds and water": 'abs:"water world" AND cat:astro-ph.EP',
    "Tidal locking": 'abs:"tidally locked" AND cat:astro-ph.EP',
    "TESS discoveries": 'abs:TESS AND abs:"planet candidate"',
    "Kepler discoveries": 'abs:Kepler AND abs:"habitable" AND cat:astro-ph.EP',
    "Mars surface and Jezero": 'abs:Mars AND (abs:Jezero OR abs:Perseverance OR abs:Curiosity)',
    "Mars climate and water": 'abs:Mars AND abs:"liquid water" AND cat:astro-ph.EP',
}


def fetch_topic(topic: str, q: str) -> list[dict]:
    url = API + "?" + urllib.parse.urlencode({"search_query": q, "start": 0, "max_results": PER_TOPIC, "sortBy": "relevance"})
    with urllib.request.urlopen(url, timeout=90) as r:
        root = ET.fromstring(r.read())
    out = []
    for e in root.findall("a:entry", NS):
        aid = e.findtext("a:id", "", NS).rsplit("/abs/", 1)[-1]
        aid = re.sub(r"v\d+$", "", aid)
        out.append(
            {
                "id": aid,
                "title": " ".join(e.findtext("a:title", "", NS).split()),
                "abstract": " ".join(e.findtext("a:summary", "", NS).split()),
                "authors": [a.findtext("a:name", "", NS) for a in e.findall("a:author", NS)][:12],
                "published": e.findtext("a:published", "", NS)[:10] or None,
                "topic": topic,
                "url": f"https://arxiv.org/abs/{aid}",
            }
        )
    return out


def download() -> list[dict]:
    if RAW.exists():
        return json.loads(RAW.read_text(encoding="utf-8"))
    papers: dict[str, dict] = {}
    for i, (topic, q) in enumerate(TOPICS.items(), 1):
        print(f"  {i}/{len(TOPICS)} {topic}…")
        for attempt in range(3):
            try:
                for p in fetch_topic(topic, q):
                    papers.setdefault(p["id"], p)
                break
            except Exception as e:  # arXiv sometimes times out; wait and retry
                print(f"    retrying ({e.__class__.__name__})")
                time.sleep(10)
        time.sleep(3.2)
    out = list(papers.values())
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(json.dumps(out), encoding="utf-8")
    return out


def mention_finder(hosts: list[str]):
    """A regex that finds known star names (TRAPPIST-1, Kepler-186, K2-18, ...) in text."""
    hosts = sorted({h for h in hosts if len(h) >= 4}, key=len, reverse=True)
    pattern = re.compile(r"(?<![\w-])(" + "|".join(re.escape(h) for h in hosts) + r")(?![\w-])", re.I)
    canon = {h.lower(): h for h in hosts}
    return lambda text: sorted({canon[m.lower()] for m in pattern.findall(text)})


def main():
    t0 = time.time()
    print("Downloading abstracts from arXiv…")
    papers = download()
    with connect() as conn, conn.cursor() as cur:
        cur.execute("select distinct host from planets")
        hosts = [r["host"] for r in cur.fetchall()]
    find = mention_finder(hosts) if hosts else (lambda t: [])
    for p in papers:
        p["mentions"] = find(p["title"] + " " + p["abstract"])
    print(f"{len(papers):,} papers; {sum(1 for p in papers if p['mentions'])} name a known star system.")
    print("Embedding abstracts…")
    vecs = embeddings.embed_passages([p["title"] + ". " + p["abstract"] for p in papers], batch_size=32)
    with connect() as conn, conn.cursor() as cur:
        cur.execute("delete from papers")
        with cur.copy("copy papers (id, title, abstract, authors, published, topic, url, mentions, embedding) from stdin") as cp:
            for p, v in zip(papers, vecs):
                cp.write_row([p["id"], p["title"], p["abstract"], p["authors"], p["published"], p["topic"], p["url"], p["mentions"], embeddings.to_pgvector(v)])
        conn.commit()
    print(f"Done in {time.time() - t0:.0f} s.")


if __name__ == "__main__":
    main()
