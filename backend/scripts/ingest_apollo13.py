"""Load the Apollo 13 transcript into Supabase and build the RAG index.

Run from the backend folder:   python scripts/ingest_apollo13.py

Steps:
  1. download the cleaned NASA transcript and mission data from Spacelog (GitHub)
  2. parse 11,000+ timestamped lines
  3. group them into conversation chunks
  4. embed every chunk with BAAI/bge-small-en-v1.5 (384 numbers each)
  5. replace the mission's rows in Supabase

Safe to run again: it deletes and rebuilds the Apollo 13 rows only.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import embeddings  # noqa: E402
from app.db import connect  # noqa: E402
from app.transcript import chunk_utterances, parse_met, parse_transcript  # noqa: E402

MISSION = "a13"
BASE = "https://raw.githubusercontent.com/Spacelog/Spacelog/master/missions/a13/transcripts/"
RAW_DIR = ROOT / "data" / "raw" / "a13"


def fetch(name: str) -> str:
    path = RAW_DIR / name
    if not path.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        print(f"  downloading {name}…")
        with urllib.request.urlopen(BASE + name, timeout=60) as r:
            path.write_bytes(r.read())
    return path.read_text(encoding="utf-8")


def main():
    t0 = time.time()
    print("1. Getting the transcript")
    raw = fetch("TEC")
    meta = json.loads(fetch("_meta"))

    print("2. Parsing")
    utts = parse_transcript(raw)
    acts = [
        {"idx": i, "title": a["title"], "description": a.get("description", ""), "start_met": parse_met(a["range"][0]), "end_met": parse_met(a["range"][1])}
        for i, a in enumerate(meta["acts"])
    ]
    scenes = [
        {"idx": i, "title": s["title"].replace("<sub>2</sub>", "₂"), "start_met": parse_met(s["range"][0]), "end_met": parse_met(s["range"][1])}
        for i, s in enumerate(meta["key_scenes"])
    ]
    chars = meta["characters"]
    names = {code: c.get("short_name") or c.get("name") or code for code, c in chars.items()}
    print(f"   {len(utts):,} lines, {len(acts)} acts, {len(scenes)} key scenes, {len(chars)} speakers")

    print("3. Chunking")
    chunks = chunk_utterances(utts, names, acts)
    print(f"   {len(chunks):,} chunks")

    print("4. Embedding (the model downloads once, about 67 MB)")
    vectors: list[list[float]] = []
    batch = 64
    for i in range(0, len(chunks), batch):
        vectors += embeddings.embed_passages([c.embed_text for c in chunks[i : i + batch]])
        print(f"\r   {min(i + batch, len(chunks)):,}/{len(chunks):,}", end="", flush=True)
    print()

    print("5. Writing to Supabase")
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("delete from missions where id = %s", (MISSION,))
            cur.execute(
                "insert into missions (id, title, summary, launch_utc) values (%s, %s, %s, %s)",
                (MISSION, "Apollo 13", meta["copy"].get("summary"), meta.get("utc_launch_time")),
            )
            cur.executemany(
                "insert into mission_acts (mission_id, idx, title, description, start_met, end_met) values (%s,%s,%s,%s,%s,%s)",
                [(MISSION, a["idx"], a["title"], a["description"], a["start_met"], a["end_met"]) for a in acts],
            )
            cur.executemany(
                "insert into key_scenes (mission_id, idx, title, start_met, end_met) values (%s,%s,%s,%s,%s)",
                [(MISSION, s["idx"], s["title"], s["start_met"], s["end_met"]) for s in scenes],
            )
            cur.executemany(
                "insert into speakers (mission_id, code, name, short_name, role) values (%s,%s,%s,%s,%s)",
                [(MISSION, code, c.get("name"), c.get("short_name"), c.get("role")) for code, c in chars.items()],
            )
            with cur.copy("copy utterances (mission_id, met, speaker, text, page, tape, key_line) from stdin") as cp:
                for u in utts:
                    cp.write_row((MISSION, u.met, u.speaker, u.text, u.page, u.tape, "Key line" in u.labels))
            print(f"   {len(utts):,} lines written")
            with cur.copy("copy chunks (mission_id, source, start_met, end_met, speakers, act, content, embedding) from stdin") as cp:
                for c, v in zip(chunks, vectors):
                    cp.write_row((MISSION, "transcript", c.start_met, c.end_met, c.speakers, c.act, c.content, embeddings.to_pgvector(v)))
            print(f"   {len(chunks):,} chunks written")
        conn.commit()

    print(f"Done in {time.time() - t0:.0f} s.")


if __name__ == "__main__":
    main()
