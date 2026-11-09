"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Astronaut, Earth, Icon, Logo, Moon, Satellite } from "@/components/Art";
import { STATIONS } from "@/components/StationNav";
import { getHealth } from "@/lib/api";

const ABOUT: Record<string, { what: string; rag: string; data: string; icon: string }> = {
  "/mission-control": {
    icon: "rocket",
    what: "Relive Apollo 13 in mission time. Talk to the crew, then make the crisis calls yourself.",
    rag: "Hybrid search + RRF + cross-encoder rerank, time-filtered; query rewriting; decisions graded from the transcript",
    data: "11,264 radio lines from the NASA transcript",
  },
  "/mars": {
    icon: "mars",
    what: "Search NASA's Mars pictures with words, with a picture, or with your own photo.",
    rag: "Multimodal RAG: CLIP puts pictures and words in one vector space; cited briefings",
    data: "NASA Image and Video Library",
  },
  "/starship": {
    icon: "galaxy",
    what: "Fly a 3D map of every known exoplanet and ask the science officer anything.",
    rag: "Table RAG: the model writes a validated query plan, never SQL; fused with paper search",
    data: "NASA Exoplanet Archive + arXiv abstracts",
  },
  "/planet-lab": {
    icon: "planet",
    what: "Invent a planet. Three AI scientists debate whether it could host life.",
    rag: "Analog-planet retrieval + paper RAG + multi-agent debate with a judge",
    data: "Exoplanet table + research papers",
  },
  "/knowledge-map": {
    icon: "graph",
    what: "Everything the stations know, as one graph. Ask questions that cross sources.",
    rag: "GraphRAG: entity linking, graph expansion, evidence on every edge",
    data: "Built from all the stations",
  },
  "/eval": {
    icon: "chart",
    what: "How good is the retrieval, measured? Four methods on questions with known answers.",
    rag: "Hit@k, MRR, coverage accuracy and LLM-judged faithfulness",
    data: "28 questions with ground-truth mission times",
  },
};

export default function Hub() {
  const [health, setHealth] = useState<{ ok: boolean; chunks: number; llm: boolean; model: string } | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    getHealth().then(setHealth).catch(() => setDown(true));
  }, []);

  return (
    <main className="hub">
      <nav className="hub-nav" aria-label="Main">
        <Link href="/" className="hub-brand">
          <Logo size={38} />
          <span>ODYSSEY</span>
        </Link>
        <div className="hub-links">
          {STATIONS.map((s) => (
            <Link key={s.href} href={s.href}>
              {s.name}
            </Link>
          ))}
        </div>
        <span className={`hub-status ${down ? "bad" : health?.ok ? "ok" : ""}`} title={health ? `${health.chunks} chunks · ${health.model}` : ""}>
          <i />
          {down ? "Backend offline" : health ? "Systems online" : "Connecting…"}
        </span>
      </nav>

      <section className="hero">
        <div className="hero-text">
          <p className="hero-badge">★ Explore · Discover · Analyze</p>
          <h1>ODYSSEY</h1>
          <p className="hero-sub">A mission through real NASA data, powered by retrieval-augmented generation. Every answer cites its source.</p>
          <ul className="hero-stats">
            <li>
              <Icon name="rocket" />
              <b>5</b>
              <span>RAG stations</span>
            </li>
            <li>
              <Icon name="database" />
              <b>{health ? health.chunks.toLocaleString() : "2,264"}</b>
              <span>transcript chunks</span>
            </li>
            <li>
              <Icon name="globe" />
              <b>100%</b>
              <span>real NASA data</span>
            </li>
          </ul>
          <Link href="/mission-control" className="launch">
            <Icon name="rocket" size={18} /> Launch mission <span aria-hidden="true">→</span>
          </Link>
          {down && <p className="hero-warn">Start the backend: uvicorn app.main:app --port 8000</p>}
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-sat">
            <Satellite size={230} />
          </div>
          <div className="art-moon">
            <Moon size={46} />
          </div>
          <div className="art-earth">
            <Earth size={560} />
          </div>
          <div className="art-astro">
            <Astronaut size={420} />
          </div>
        </div>
        <a href="#stations" className="scroll-down" aria-label="Scroll to the stations">
          ↓
        </a>
      </section>

      <section id="stations" className="hub-section">
        <h2>Choose your station</h2>
        <ol className="hub-grid">
          {STATIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="hub-card" data-st={s.href.slice(1)}>
                <span className="hub-icon" aria-hidden="true">
                  <Icon name={ABOUT[s.href].icon} size={24} />
                </span>
                <span className="hub-n">{s.n === 6 ? "Quality check" : `Station ${s.n}`}</span>
                <h3>{s.name}</h3>
                <p>{ABOUT[s.href].what}</p>
                <dl>
                  <dt>RAG</dt>
                  <dd>{ABOUT[s.href].rag}</dd>
                  <dt>Data</dt>
                  <dd>{ABOUT[s.href].data}</dd>
                </dl>
                <span className="hub-go">Enter →</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
