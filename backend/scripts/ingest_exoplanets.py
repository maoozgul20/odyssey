"""Station 3: load every confirmed exoplanet from the NASA Exoplanet Archive.

Run from the backend folder:   python scripts/ingest_exoplanets.py

  1. download the Planetary Systems Composite table (about 6,000 planets) as CSV
  2. compute size class, habitable zone and Earth Similarity Index for each planet
  3. write a plain-English card per planet and embed it (for semantic search)
  4. replace the planets table in Supabase

The download is cached in data/raw/exoplanets.csv; delete it to fetch fresh data.
"""

from __future__ import annotations

import csv
import io
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import embeddings  # noqa: E402
from app.db import connect  # noqa: E402
from app.planets import describe, esi, in_hz, size_class  # noqa: E402

TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
COLS = (
    "pl_name,hostname,sy_dist,ra,dec,pl_rade,pl_bmasse,pl_orbper,pl_orbsmax,pl_orbeccen,pl_eqt,pl_insol,"
    "st_teff,st_rad,st_mass,st_spectype,sy_pnum,disc_year,discoverymethod,disc_facility"
)
RAW = ROOT / "data" / "raw" / "exoplanets.csv"


def download() -> str:
    if RAW.exists():
        return RAW.read_text(encoding="utf-8")
    print("Downloading the NASA Exoplanet Archive table…")
    url = TAP + "?" + urllib.parse.urlencode({"query": f"select {COLS} from pscomppars", "format": "csv"})
    with urllib.request.urlopen(url, timeout=180) as r:
        text = r.read().decode("utf-8")
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(text, encoding="utf-8")
    return text


def num(v: str):
    try:
        return float(v) if v not in ("", None) else None
    except ValueError:
        return None


def rows_from_csv(text: str) -> list[dict]:
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        p = {
            "name": r["pl_name"].strip(),
            "host": r["hostname"].strip(),
            "dist_pc": num(r["sy_dist"]),
            "ra": num(r["ra"]),
            "dec": num(r["dec"]),
            "radius": num(r["pl_rade"]),
            "mass": num(r["pl_bmasse"]),
            "period": num(r["pl_orbper"]),
            "semi_major": num(r["pl_orbsmax"]),
            "eccentricity": num(r["pl_orbeccen"]),
            "eq_temp": num(r["pl_eqt"]),
            "insolation": num(r["pl_insol"]),
            "star_teff": num(r["st_teff"]),
            "star_radius": num(r["st_rad"]),
            "star_mass": num(r["st_mass"]),
            "star_type": r["st_spectype"].strip() or None,
            "planets_in_system": int(num(r["sy_pnum"]) or 1),
            "disc_year": int(num(r["disc_year"])) if num(r["disc_year"]) else None,
            "disc_method": r["discoverymethod"].strip() or None,
            "disc_facility": r["disc_facility"].strip() or None,
        }
        if not p["name"]:
            continue
        p["size_class"] = size_class(p["radius"], p["mass"])
        p["in_hz"] = in_hz(p["insolation"])
        p["esi"] = esi(p["radius"], p["insolation"])
        p["description"] = describe(p)
        out.append(p)
    return out


FIELDS = [
    "name", "host", "dist_pc", "ra", "dec", "radius", "mass", "period", "semi_major", "eccentricity", "eq_temp", "insolation",
    "star_teff", "star_radius", "star_mass", "star_type", "planets_in_system", "disc_year", "disc_method", "disc_facility",
    "size_class", "in_hz", "esi", "description",
]


def main():
    t0 = time.time()
    planets = rows_from_csv(download())
    print(f"{len(planets):,} planets. Example card:\n  {planets[0]['description']}\n")
    print("Embedding planet cards (about 1 to 2 minutes)…")
    vecs = embeddings.embed_passages([p["description"] for p in planets])
    with connect() as conn, conn.cursor() as cur:
        cur.execute("delete from planets")
        with cur.copy(f"copy planets ({', '.join(FIELDS)}, embedding) from stdin") as cp:
            for p, v in zip(planets, vecs):
                cp.write_row([p[f] for f in FIELDS] + [embeddings.to_pgvector(v)])
        conn.commit()
    hz = sum(1 for p in planets if p["in_hz"])
    print(f"Done in {time.time() - t0:.0f} s. {hz} planets are in the habitable zone.")


if __name__ == "__main__":
    main()
