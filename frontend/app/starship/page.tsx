"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Answer } from "@/components/Answer";
import type { ColorBy, GRow } from "@/components/Galaxy3D";
import { Shell } from "@/components/Shell";
import { getJSON, stream } from "@/lib/api";

const Galaxy3D = dynamic(() => import("@/components/Galaxy3D").then((m) => m.Galaxy3D), { ssr: false, loading: () => <div className="galaxy loading">Plotting planets…</div> });

type PlanetRow = Record<string, any>;
type Paper = { id: string; title: string; published: string | null; url: string; rerank: number; abstract: string };
type Plan = { plan: any; sql: string; params: unknown[]; count: number; semantic?: boolean };

const EXAMPLES = [
  "What are the 5 closest rocky planets in the habitable zone?",
  "How many planets has TESS discovered, by discovery method?",
  "Tell me about TRAPPIST-1 e. Could it have an atmosphere?",
  "Which Earth-size planets have the highest Earth Similarity Index?",
  "What is the hottest planet known, and why is it so hot?",
];

const fmt = (v: any, d = 2) => (v == null ? "—" : typeof v === "number" ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d)) : String(v));

export default function Starship() {
  const [rows, setRows] = useState<GRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("habitable");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlanetRow | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerErr, setAnswerErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planets, setPlanets] = useState<PlanetRow[]>([]);
  const [agg, setAgg] = useState<PlanetRow[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [offset, setOffset] = useState(0);
  const [cite, setCite] = useState<number | null>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    getJSON<{ rows: GRow[] }>("/planets/galaxy")
      .then((d) => setRows(d.rows))
      .catch(() => setErr("No planets yet. Run python scripts/ingest_exoplanets.py in the backend folder, then reload."));
  }, []);

  useEffect(() => {
    if (!selected) return setDetail(null);
    getJSON<PlanetRow>(`/planets/${encodeURIComponent(selected)}`).then(setDetail).catch(() => setDetail(null));
  }, [selected]);

  const stats = useMemo(() => ({ total: rows.length, hz: rows.filter((r) => r[7]).length }), [rows]);
  const highlight = useMemo(() => planets.map((p) => p.name as string), [planets]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setQ(question);
    setBusy(true);
    setAnswer("");
    setAnswerErr(null);
    setPlan(null);
    setPlanets([]);
    setAgg([]);
    setPapers([]);
    setCite(null);
    try {
      await stream(
        "/starship/ask",
        { question },
        (ev, data) => {
          if (ev === "plan") setPlan(data);
          else if (ev === "sources") {
            setPlanets(data.planets);
            setAgg(data.aggregate);
            setPapers(data.papers);
            setOffset(data.offset_papers);
            if (data.planets[0]) setSelected(data.planets[0].name);
          } else if (ev === "token") setAnswer((a) => a + data);
          else if (ev === "error") setAnswerErr(data);
        },
        c.signal,
      );
    } catch (e) {
      if (!c.signal.aborted) setAnswerErr("Lost contact with the backend.");
    } finally {
      setBusy(false);
    }
  };

  const onCite = (n: number) => {
    setCite(n);
    const pi = n - 1 - (agg.length ? 1 : 0);
    if (pi >= 0 && pi < planets.length) setSelected(planets[pi].name);
    document.getElementById(`src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <Shell current="/starship" station="starship" title="Starship" rag="Table RAG over 6,000 real exoplanets + paper RAG over arXiv">
      <main className="st-main starship">
        <section className="sky panel">
          {err ? (
            <div className="pad">
              <h2>No planets yet</h2>
              <p>{err}</p>
            </div>
          ) : (
            rows.length > 0 && <Galaxy3D rows={rows} colorBy={colorBy} highlight={highlight} selected={selected} onPick={setSelected} />
          )}
          <div className="sky-hud">
            <span>
              {stats.total.toLocaleString()} planets · {stats.hz} in a habitable zone · rings at 10, 100, 1,000 and 10,000 light years
            </span>
            <div className="seg" role="group" aria-label="Colour planets by">
              {(["habitable", "size", "temperature", "method"] as ColorBy[]).map((c) => (
                <button key={c} type="button" className={colorBy === c ? "on" : ""} onClick={() => setColorBy(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {detail && (
            <aside className="planet-card" aria-label={`Planet ${detail.name}`}>
              <header>
                <h2>{detail.name}</h2>
                <button type="button" onClick={() => setSelected(null)} aria-label="Close">
                  ×
                </button>
              </header>
              <p className="muted small">{detail.description}</p>
              <dl className="facts">
                <dt>Distance</dt>
                <dd>{detail.dist_pc ? `${(detail.dist_pc * 3.26).toFixed(1)} ly` : "—"}</dd>
                <dt>Radius</dt>
                <dd>{fmt(detail.radius)} R⊕</dd>
                <dt>Mass</dt>
                <dd>{fmt(detail.mass)} M⊕</dd>
                <dt>Year</dt>
                <dd>{fmt(detail.period)} days</dd>
                <dt>Temp</dt>
                <dd>{fmt(detail.eq_temp, 0)} K</dd>
                <dt>ESI</dt>
                <dd>{fmt(detail.esi)}</dd>
              </dl>
              {detail.siblings?.length > 0 && <p className="small">Siblings: {detail.siblings.map((s: any) => s.name).join(", ")}</p>}
              {detail.papers?.length > 0 && (
                <ul className="mini-papers">
                  {detail.papers.map((p: any) => (
                    <li key={p.id}>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="go small" onClick={() => ask(`Tell me about ${detail.name}. Could it support life?`)}>
                Ask about this planet
              </button>
            </aside>
          )}
        </section>

        <section className="panel officer">
          <header className="panel-head">
            <h2>Science officer</h2>
            <span className="hint">answers only from the table and the papers</span>
          </header>
          <form
            className="askbar"
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about exoplanets…" aria-label="Question" />
            <button type="submit" className="go" disabled={busy || !q.trim()}>
              {busy ? "…" : "Ask"}
            </button>
          </form>
          {!plan && !busy && (
            <ul className="chips">
              {EXAMPLES.map((x) => (
                <li key={x}>
                  <button type="button" onClick={() => ask(x)}>
                    {x}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {plan && (
            <details className="plan" open>
              <summary>
                {plan.semantic ? "Semantic search over planet cards" : "Query plan"} · {plan.count} rows
              </summary>
              {plan.plan && <pre>{JSON.stringify(plan.plan, null, 1)}</pre>}
              <pre className="sql">{plan.sql}</pre>
              {plan.params.length > 0 && <p className="small mono">params: {JSON.stringify(plan.params)}</p>}
            </details>
          )}

          <Answer text={answer} count={(agg.length ? 1 : 0) + planets.length + papers.length} busy={busy} error={answerErr} onCite={onCite} />

          {(agg.length > 0 || planets.length > 0 || papers.length > 0) && (
            <ol className="sources">
              {agg.length > 0 && (
                <li id="src-1" className={cite === 1 ? "hl" : ""}>
                  <b>[1] Table result</b>
                  <table className="mini">
                    <tbody>
                      {agg.map((r, i) => (
                        <tr key={i}>
                          {Object.values(r).map((v, j) => (
                            <td key={j}>{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </li>
              )}
              {planets.map((p, i) => {
                const n = i + 1 + (agg.length ? 1 : 0);
                return (
                  <li key={p.name} id={`src-${n}`} className={cite === n ? "hl" : ""}>
                    <button type="button" className="src-planet" onClick={() => setSelected(p.name)}>
                      <b>[{n}]</b> {p.name}
                      <span>
                        {p.dist_pc ? `${(p.dist_pc * 3.26).toFixed(0)} ly` : ""} · {fmt(p.radius)} R⊕ · {fmt(p.eq_temp, 0)} K · ESI {fmt(p.esi)}
                        {p.in_hz ? " · habitable zone" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
              {papers.map((p, i) => {
                const n = offset + i + 1;
                return (
                  <li key={p.id} id={`src-${n}`} className={cite === n ? "hl" : ""}>
                    <b>[{n}]</b>{" "}
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.title}
                    </a>
                    <span className="small muted">
                      {" "}
                      {String(p.published ?? "").slice(0, 4)} · rerank {p.rerank}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </main>
    </Shell>
  );
}
