"""Build the ODYSSEY knowledge graph from everything already in the database.

Run from the backend folder, after the other ingest scripts:   python scripts/build_graph.py

Nodes are the things the stations talk about: spacecraft, systems, people, decisions,
planets, stars, telescopes, research topics, papers, rovers and places on Mars.
Edges come from evidence, never from guesses:

  Apollo 13   two things are linked when they are mentioned in the same radio conversation
              (weight = how many conversations); a person is linked to what they talk about
  Starship    planet -orbits-> star -studied in-> topic, planet -discovered by-> telescope
  Mars        rovers, orbiters and places named in the same NASA picture caption
  Bridges     links between stations (Mars, Earth, water, CO2, the two "Odyssey"s)

Every node and edge keeps its evidence (chunk ids, planet names, paper ids, picture ids),
which is what GraphRAG retrieves when you ask the Knowledge Map a question.
"""

from __future__ import annotations

import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import embeddings  # noqa: E402
from app.db import connect  # noqa: E402

# ---------- Apollo 13 vocabulary: id, label, kind, description, words that mean it ----------
A13 = [
    ("odyssey", "Odyssey (command module)", "spacecraft", "The Apollo 13 command module, the crew's ship home.", ["odyssey", "command module", "cm", "csm"]),
    ("aquarius", "Aquarius (lunar module)", "spacecraft", "The lunar module that became the crew's lifeboat.", ["aquarius", "lunar module", "lm"]),
    ("service-module", "Service module", "spacecraft", "Held the oxygen tanks, fuel cells and main engine; damaged by the explosion.", ["service module", "sm"]),
    ("s-ivb", "S-IVB stage", "spacecraft", "The Saturn V third stage, later crashed into the Moon.", ["s-ivb", "s4b", "sivb", "s-4b"]),
    ("o2-tank-2", "Oxygen tank 2", "system", "The cryogenic oxygen tank that exploded at 55:54 GET.", ["o2 tank 2", "oxygen tank 2", "tank 2", "o2 tank two"]),
    ("cryo", "Cryogenic tanks", "system", "Supercritical oxygen and hydrogen tanks that fed the fuel cells.", ["cryo", "cryos", "o2 tank", "oxygen tank", "o2 quantity", "h2 tank", "hydrogen tank"]),
    ("fuel-cells", "Fuel cells", "system", "Made the command module's power and water from oxygen and hydrogen.", ["fuel cell", "fuel cells", "fc"]),
    ("main-bus-b", "Main bus B", "system", "The electrical bus whose undervolt was the first warning.", ["main b", "main bus b", "bus b"]),
    ("batteries", "Batteries", "system", "Entry batteries in Odyssey and the LM's descent batteries.", ["battery", "batteries", "bat a", "bat b", "bat c"]),
    ("co2", "Carbon dioxide", "system", "CO2 built up in the LM, whose filters were made for two men for two days.", ["co2", "carbon dioxide", "pp co2", "partial pressure"]),
    ("lioh", "LiOH canisters", "system", "Lithium hydroxide filters that absorb CO2.", ["lioh", "lithium hydroxide", "canister", "canisters", "cartridge", "cartridges"]),
    ("mailbox", "The mailbox", "event", "The improvised adapter that fitted square CM canisters to the LM.", ["mailbox"]),
    ("dps", "Descent engine (DPS)", "system", "The LM's descent engine, used for the course corrections home.", ["dps", "descent engine", "descent propulsion"]),
    ("sps", "Main engine (SPS)", "system", "The service module's big engine, judged too risky to fire.", ["sps", "service propulsion"]),
    ("rcs", "RCS thrusters", "system", "Small attitude thrusters on both spacecraft.", ["rcs", "quad", "quads"]),
    ("pc-plus-2", "PC+2 burn", "event", "The burn two hours after closest approach to the Moon that sped up the return.", ["pc plus 2", "pc+2", "pericynthion plus 2"]),
    ("free-return", "Free-return trajectory", "event", "A path that loops around the Moon and back to Earth without more burns.", ["free return", "free-return"]),
    ("midcourse", "Midcourse corrections", "event", "Small burns to aim the spacecraft.", ["midcourse", "mcc", "midcourse correction"]),
    ("platform", "Guidance platform", "system", "The inertial platform; aligning it without stars was a problem.", ["platform", "imu", "alignment", "align", "p52"]),
    ("power-down", "Power-down", "event", "Turning almost everything off to save power and water.", ["power down", "powerdown", "power-down", "powered down", "amps"]),
    ("water", "Water", "system", "Drinking and cooling water: the LM ran short.", ["water", "potable"]),
    ("cold", "Cold cabin", "event", "With power off, the cabins dropped to about 38 F (3 C).", ["cold", "freezing", "chilly"]),
    ("urine-dump", "Urine dumps", "event", "Waste water dumps, stopped because they pushed the ship off course.", ["urine"]),
    ("comet-bennett", "Comet Bennett", "event", "A comet the crew photographed before the accident.", ["comet", "bennett"]),
    ("tv", "TV broadcast", "event", "The broadcast that ended minutes before the explosion.", ["tv", "television"]),
    ("moon", "The Moon", "place", "Apollo 13 swung around the far side without landing.", ["moon", "lunar"]),
    ("earth", "Earth", "place", "Home.", ["earth"]),
    ("fra-mauro", "Fra Mauro", "place", "The planned landing site, later visited by Apollo 14.", ["fra mauro"]),
    ("re-entry", "Re-entry", "event", "Entering Earth's atmosphere, with a radio blackout.", ["entry", "reentry", "re-entry", "entry interface", "blackout"]),
    ("jettison", "Jettisons", "event", "Letting go of the service module and then Aquarius.", ["jettison", "jettisoned", "sep", "separation"]),
    ("splashdown", "Splashdown", "event", "Landing in the Pacific near the USS Iwo Jima.", ["splashdown", "iwo jima", "recovery", "swimmers"]),
    ("high-gain", "High-gain antenna", "system", "The dish for strong radio links.", ["high gain", "high-gain", "omni", "s-band"]),
]
PEOPLE = {"CDR": "Jim Lovell", "LMP": "Fred Haise", "CMP": "Jack Swigert", "CC": "CapCom (Houston)"}

# ---------- Mars vocabulary ----------
MARS = [
    ("perseverance", "Perseverance rover", "rover", ["perseverance", "mars 2020"]),
    ("curiosity", "Curiosity rover", "rover", ["curiosity", "msl", "mars science laboratory"]),
    ("opportunity", "Opportunity rover", "rover", ["opportunity"]),
    ("spirit", "Spirit rover", "rover", ["spirit rover", "spirit's", "mer-a"]),
    ("ingenuity", "Ingenuity helicopter", "rover", ["ingenuity", "helicopter"]),
    ("sojourner", "Sojourner / Pathfinder", "rover", ["sojourner", "pathfinder"]),
    ("insight", "InSight lander", "rover", ["insight"]),
    ("phoenix", "Phoenix lander", "rover", ["phoenix"]),
    ("viking", "Viking landers", "rover", ["viking"]),
    ("mro", "Mars Reconnaissance Orbiter (HiRISE)", "rover", ["reconnaissance orbiter", "mro", "hirise"]),
    ("mars-odyssey", "2001 Mars Odyssey orbiter", "rover", ["mars odyssey", "2001 mars odyssey", "themis"]),
    ("maven", "MAVEN orbiter", "rover", ["maven"]),
    ("jezero", "Jezero crater", "place", ["jezero"]),
    ("gale", "Gale crater / Mount Sharp", "place", ["gale crater", "mount sharp", "aeolis mons"]),
    ("olympus-mons", "Olympus Mons", "place", ["olympus mons"]),
    ("valles-marineris", "Valles Marineris", "place", ["valles marineris"]),
    ("gusev", "Gusev crater", "place", ["gusev"]),
    ("meridiani", "Meridiani Planum", "place", ["meridiani", "endurance crater", "victoria crater", "eagle crater"]),
    ("polar-cap", "Polar ice caps", "place", ["polar cap", "ice cap", "polar ice", "north pole", "south pole"]),
    ("dust-storm", "Dust storms", "event", ["dust storm", "dust storms"]),
    ("dust-devil", "Dust devils", "event", ["dust devil", "dust devils"]),
    ("dunes", "Sand dunes", "place", ["dune", "dunes"]),
    ("sunset", "Martian sunset", "event", ["sunset"]),
    ("sedimentary", "Layered sedimentary rock", "place", ["sedimentary", "layers", "layered", "delta"]),
]
PLAB_TOPICS = {"Habitable zone planets", "Biosignatures", "Ocean worlds and water", "Tidal locking", "M dwarf planets and flares"}


def matcher(words: list[str]):
    return re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True)) + r")(?![a-z0-9])")


class Graph:
    def __init__(self):
        self.nodes: dict[str, dict] = {}
        self.edges: dict[tuple, dict] = {}

    def node(self, id, label, kind, station, description="", weight=1, evidence=None, aliases=None):
        n = self.nodes.setdefault(id, {"id": id, "label": label, "kind": kind, "station": station, "description": description, "weight": 0, "evidence": [], "aliases": []})
        for a in aliases or []:
            # plain words only, so they are safe inside the regular expression used for matching
            if len(a) >= 3 and re.fullmatch(r"[a-z0-9 ]+", a) and a not in n["aliases"]:
                n["aliases"].append(a)
        n["weight"] += weight
        for e in evidence or []:
            if e not in n["evidence"] and len(n["evidence"]) < 12:
                n["evidence"].append(e)
        return n

    def edge(self, src, dst, relation, weight=1.0, evidence=None):
        if src == dst or src not in self.nodes or dst not in self.nodes:
            return
        if src > dst and relation in ("mentioned with", "seen with"):
            src, dst = dst, src
        e = self.edges.setdefault((src, dst, relation), {"src": src, "dst": dst, "relation": relation, "weight": 0.0, "evidence": []})
        e["weight"] += weight
        for x in evidence or []:
            if x not in e["evidence"] and len(e["evidence"]) < 6:
                e["evidence"].append(x)


def apollo(g: Graph, cur):
    cur.execute("select id, content, speakers, act from chunks where mission_id = 'a13' order by start_met")
    chunks = cur.fetchall()
    pats = {eid: matcher(words) for eid, _, _, _, words in A13}
    for eid, label, kind, desc, words in A13:
        g.node(f"a13:{eid}", label, kind, "mission-control", desc, weight=0, aliases=words)
    for code, name in PEOPLE.items():
        g.node(f"a13:person:{code}", name, "person", "mission-control", f"{name}, Apollo 13", weight=0)

    pair = Counter()
    pair_ev = defaultdict(list)
    talk = Counter()
    talk_ev = defaultdict(list)
    act_count = defaultdict(Counter)
    for c in chunks:
        # only what people said, not the speaker labels ("Jim Lovell (CDR):")
        text = " ".join(line.split(": ", 1)[-1] for line in c["content"].lower().splitlines())
        found = sorted(eid for eid, p in pats.items() if p.search(text))
        ev = {"type": "chunk", "id": c["id"]}
        for eid in found:
            g.node(f"a13:{eid}", "", "", "", weight=1, evidence=[ev] if len(g.nodes[f"a13:{eid}"]["evidence"]) < 12 else [])
            act_count[c["act"]][eid] += 1
        for i, a in enumerate(found):
            for b in found[i + 1 :]:
                pair[(a, b)] += 1
                if len(pair_ev[(a, b)]) < 6:
                    pair_ev[(a, b)].append(ev)
        for sp in c["speakers"] or []:
            if sp in PEOPLE:
                for eid in found:
                    talk[(sp, eid)] += 1
                    if len(talk_ev[(sp, eid)]) < 6:
                        talk_ev[(sp, eid)].append(ev)
                g.nodes[f"a13:person:{sp}"]["weight"] += 1

    for (a, b), n in pair.most_common():
        if n >= 4:
            g.edge(f"a13:{a}", f"a13:{b}", "mentioned with", n, pair_ev[(a, b)])
    for (sp, eid), n in talk.most_common():
        if n >= 8:
            g.edge(f"a13:person:{sp}", f"a13:{eid}", "talks about", n, talk_ev[(sp, eid)])

    cur.execute("select idx, title, description, start_met, end_met from mission_acts where mission_id = 'a13' order by idx")
    for a in cur.fetchall():
        aid = f"a13:act:{a['idx']}"
        g.node(aid, f"Act: {a['title']}", "act", "mission-control", a["description"] or "", weight=5)
        for eid, n in act_count[a["title"]].most_common(6):
            g.edge(aid, f"a13:{eid}", "features", n)

    decisions = json.loads((ROOT / "data" / "decisions.json").read_text(encoding="utf-8"))
    for d in decisions:
        did = f"decision:{d['id']}"
        nasa = next(o["text"] for o in d["options"] if o["id"] == d["nasa"])
        g.node(did, f"Decision: {d['title']}", "decision", "mission-control", f"{d['question']} Houston's call: {nasa}", weight=6)
        text = (d["question"] + " " + nasa).lower()
        for eid, p in pats.items():
            if p.search(text):
                g.edge(did, f"a13:{eid}", "involves", 3)


def starship(g: Graph, cur):
    cur.execute("select count(*) as n from planets")
    if cur.fetchone()["n"] == 0:
        print("  (no planets yet: run ingest_exoplanets.py, then build the graph again)")
        return
    cur.execute("select topic, count(*) as n from papers group by topic")
    for t in cur.fetchall():
        g.node(f"topic:{t['topic']}", t["topic"], "topic", "planet-lab" if t["topic"] in PLAB_TOPICS else "starship", f"{t['n']} research papers", weight=t["n"] // 5 + 1)
    # how often each star system is named in papers, per topic
    cur.execute("select host, topic, count(*) as n, array_agg(id) as ids from papers, unnest(mentions) as host group by host, topic")
    host_topic = cur.fetchall()
    host_papers = Counter()
    for r in host_topic:
        host_papers[r["host"]] += r["n"]
    famous = [h for h, n in host_papers.most_common(25) if n >= 2]

    cur.execute(
        """select name, host, description, esi, in_hz, disc_facility, disc_method from planets
           where (in_hz and esi is not null) or host = any(%s)
           order by (host = any(%s)) desc, esi desc nulls last limit 90""",
        (famous, famous),
    )
    planets = cur.fetchall()
    for p in planets:
        pid = f"planet:{p['name']}"
        g.node(pid, p["name"], "planet", "starship", p["description"], weight=2 + int((p["esi"] or 0) * 6), evidence=[{"type": "planet", "id": p["name"]}])
        g.node(f"star:{p['host']}", p["host"], "star", "starship", f"Star system with known planets", weight=1)
        g.edge(pid, f"star:{p['host']}", "orbits", 2)
        if p["disc_facility"]:
            g.node(f"facility:{p['disc_facility']}", p["disc_facility"], "facility", "starship", "Telescope or survey that found planets", weight=1)
            g.edge(pid, f"facility:{p['disc_facility']}", "discovered by", 1)
        if p["disc_method"]:
            g.node(f"method:{p['disc_method']}", p["disc_method"], "method", "starship", "Planet discovery method", weight=1)
            g.edge(pid, f"method:{p['disc_method']}", "found via", 1)
        if p["in_hz"] and "topic:Habitable zone planets" in g.nodes:
            g.edge(pid, "topic:Habitable zone planets", "in", 1)
    for r in host_topic:
        sid = f"star:{r['host']}"
        if sid in g.nodes:
            g.edge(sid, f"topic:{r['topic']}", "studied in", r["n"], [{"type": "paper", "id": i} for i in r["ids"][:6]])

    # a few papers per well-studied star become nodes of their own
    cur.execute(
        """select id, title, abstract, topic, mentions from papers
           where mentions && %s order by cardinality(mentions) desc, published desc nulls last limit 60""",
        (famous,),
    )
    for p in cur.fetchall():
        nid = f"paper:{p['id']}"
        g.node(nid, p["title"][:90], "paper", "planet-lab" if p["topic"] in PLAB_TOPICS else "starship", p["abstract"][:600], 1, [{"type": "paper", "id": p["id"]}])
        g.edge(nid, f"topic:{p['topic']}", "about", 1)
        for h in p["mentions"]:
            g.edge(nid, f"star:{h}", "mentions", 1)


def mars(g: Graph, cur):
    cur.execute("select nasa_id, title, description, keywords from mars_images")
    imgs = cur.fetchall()
    if not imgs:
        print("  (no Mars pictures yet: run ingest_mars.py, then build the graph again)")
        return
    pats = {mid: matcher(words) for mid, _, _, words in MARS}
    for mid, label, kind, words in MARS:
        g.node(f"mars:{mid}", label, kind, "mars", "", weight=0, aliases=words)
    pair = Counter()
    pair_ev = defaultdict(list)
    for im in imgs:
        text = (im["title"] + " " + im["description"] + " " + " ".join(im["keywords"])).lower()
        found = sorted(m for m, p in pats.items() if p.search(text))
        ev = {"type": "image", "id": im["nasa_id"]}
        for m in found:
            g.node(f"mars:{m}", "", "", "", weight=1, evidence=[ev])
        for i, a in enumerate(found):
            for b in found[i + 1 :]:
                pair[(a, b)] += 1
                if len(pair_ev[(a, b)]) < 6:
                    pair_ev[(a, b)].append(ev)
    for (a, b), n in pair.items():
        if n >= 2:
            g.edge(f"mars:{a}", f"mars:{b}", "seen with", n, pair_ev[(a, b)])
    for mid, _, _, _ in MARS:
        n = g.nodes[f"mars:{mid}"]
        n["description"] = f"Appears in {n['weight']} NASA pictures"


def bridges(g: Graph):
    g.node("bridge:mars", "Mars", "place", "bridge", "The red planet: rovers, orbiters and research on its past water.", weight=8)
    g.node("bridge:life", "Life beyond Earth", "topic", "bridge", "The question that links every station.", weight=8)
    for mid, _, kind, _ in MARS:
        if kind == "rover" and g.nodes.get(f"mars:{mid}", {}).get("weight", 0) > 0:
            g.edge(f"mars:{mid}", "bridge:mars", "explores", 2)
    for t in ("Mars surface and Jezero", "Mars climate and water"):
        g.edge(f"topic:{t}", "bridge:mars", "about", 3)
    for t in ("Biosignatures", "Habitable zone planets", "Ocean worlds and water"):
        g.edge(f"topic:{t}", "bridge:life", "asks about", 3)
    g.edge("mars:jezero", "bridge:life", "searched for signs of", 3)
    g.edge("a13:earth", "bridge:life", "the only known home of", 3)
    g.edge("a13:odyssey", "mars:mars-odyssey", "shares its name with", 2)
    g.edge("a13:water", "topic:Ocean worlds and water", "same resource as", 1)
    g.edge("a13:water", "topic:Mars climate and water", "same resource as", 1)
    g.edge("a13:co2", "topic:Exoplanet atmospheres (JWST)", "same molecule measured in", 1)
    g.edge("a13:moon", "bridge:mars", "first step toward", 1)


def main():
    t0 = time.time()
    g = Graph()
    with connect() as conn, conn.cursor() as cur:
        print("Apollo 13…")
        apollo(g, cur)
        print("Starship and papers…")
        starship(g, cur)
        print("Mars…")
        mars(g, cur)
        bridges(g)
        # drop things nobody mentioned, and edges that point at them
        g.nodes = {k: n for k, n in g.nodes.items() if n["weight"] > 0}
        edges = [e for e in g.edges.values() if e["src"] in g.nodes and e["dst"] in g.nodes]
        print(f"{len(g.nodes)} nodes, {len(edges)} edges. Embedding node descriptions…")
        nodes = list(g.nodes.values())
        vecs = embeddings.embed_passages([f"{n['label']}. {n['kind']}. {n['description']}" for n in nodes])
        cur.execute("delete from kg_edges")
        cur.execute("delete from kg_nodes")
        with cur.copy("copy kg_nodes (id, label, aliases, kind, station, description, weight, evidence, embedding) from stdin") as cp:
            for n, v in zip(nodes, vecs):
                cp.write_row([n["id"], n["label"], n["aliases"], n["kind"], n["station"], n["description"], n["weight"], json.dumps(n["evidence"]), embeddings.to_pgvector(v)])
        with cur.copy("copy kg_edges (src, dst, relation, weight, evidence) from stdin") as cp:
            for e in edges:
                cp.write_row([e["src"], e["dst"], e["relation"], e["weight"], json.dumps(e["evidence"])])
        conn.commit()
    kinds = Counter(n["station"] for n in nodes)
    print("By station:", dict(kinds))
    print(f"Done in {time.time() - t0:.0f} s.")


if __name__ == "__main__":
    main()
