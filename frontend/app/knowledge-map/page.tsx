"use client";

import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import { Answer } from "@/components/Answer";
import { Shell } from "@/components/Shell";
import { getJSON, stream } from "@/lib/api";
import { fmt } from "@/lib/met";

type N = SimulationNodeDatum & { id: string; label: string; kind: string; station: string; weight: number; r: number };
type E = SimulationLinkDatum<N> & { src: string; dst: string; relation: string; weight: number };
type Ev = { type: string; id: string | number; title: string; text: string; url?: string; thumb_url?: string; start_met?: number; rerank?: number };
type NodeDetail = { id: string; label: string; kind: string; station: string; description: string; weight: number; neighbors: { src: string; dst: string; relation: string; weight: number; label: string; kind: string; station: string }[]; evidence: Ev[] };

const STATION_COL: Record<string, string> = { "mission-control": "#4ee59a", mars: "#ff8a4c", starship: "#4fc8e6", "planet-lab": "#d58cf0", bridge: "#e8c25a" };
const STATION_NAME: Record<string, string> = { "mission-control": "Apollo 13", mars: "Mars", starship: "Exoplanets & papers", "planet-lab": "Habitability", bridge: "Bridges" };
const EXAMPLES = [
  "How is the CO2 problem on Apollo 13 connected to exoplanet atmosphere research?",
  "What links the spacecraft Odyssey to Mars?",
  "Which telescopes found the most Earth-like planets?",
  "Where on Mars have rovers looked for signs of ancient water?",
];

export default function KnowledgeMap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{ nodes: N[]; edges: E[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<NodeDetail | null>(null);
  const [lit, setLit] = useState<{ seeds: Set<string>; nodes: Set<string> } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerErr, setAnswerErr] = useState<string | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Ev[]>([]);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const hover = useRef<N | null>(null);
  const state = useRef({ hidden, lit, selId: null as string | null });
  state.current = { hidden, lit, selId: sel?.id ?? null };
  const sim = useRef<Simulation<N, E> | null>(null);

  useEffect(() => {
    getJSON<{ nodes: Omit<N, "r">[]; edges: Omit<E, "source" | "target">[] }>("/graph")
      .then((g) => {
        const nodes: N[] = g.nodes.map((n) => ({ ...n, r: 3 + Math.min(14, Math.sqrt(n.weight) * 0.9) }));
        const ids = new Set(nodes.map((n) => n.id));
        const edges: E[] = g.edges.filter((e) => ids.has(e.src) && ids.has(e.dst)).map((e) => ({ ...e, source: e.src, target: e.dst }));
        setData({ nodes, edges });
      })
      .catch(() => setErr("The graph is empty. Run python scripts/build_graph.py in the backend folder, then reload."));
  }, []);

  const byId = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);

  // layout + drawing
  useEffect(() => {
    if (!data || !canvas.current) return;
    const cv = canvas.current;
    const ctx = cv.getContext("2d")!;
    const maxW = Math.max(...data.edges.map((e) => e.weight), 1);
    // each station gets its own corner, bridges sit in the middle
    const sc = cv.clientWidth < 700 ? 0.45 : 1;
    const anchor: Record<string, [number, number]> = { "mission-control": [-260 * sc, -60], starship: [240 * sc, -80], "planet-lab": [200 * sc, 200], mars: [-180 * sc, 230], bridge: [20 * sc, 60] };
    const s = forceSimulation<N, E>(data.nodes)
      .force("link", forceLink<N, E>(data.edges).id((d) => d.id).distance((e) => 40 + 50 * (1 - Math.log1p(e.weight) / Math.log1p(maxW))).strength(0.25))
      .force("charge", forceManyBody<N>().strength(-60))
      .force("collide", forceCollide<N>().radius((d) => d.r + 3))
      .force("x", forceX<N>((d) => anchor[d.station]?.[0] ?? 0).strength(0.06))
      .force("y", forceY<N>((d) => anchor[d.station]?.[1] ?? 0).strength(0.06))
      .force("center", forceCenter(0, 0));
    sim.current = s;

    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      const { x, y, k } = view.current;
      const { hidden, lit, selId } = state.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + x, h / 2 + y);
      ctx.scale(k, k);
      const on = (n: N) => !hidden.has(n.station);
      const glow = (id: string) => !lit || lit.nodes.has(id);
      for (const e of data.edges) {
        const a = e.source as N, b = e.target as N;
        if (!on(a) || !on(b)) continue;
        const hot = lit ? lit.nodes.has(a.id) && lit.nodes.has(b.id) : selId ? a.id === selId || b.id === selId : false;
        ctx.strokeStyle = hot ? "rgba(255,192,77,0.9)" : a.station === "bridge" || b.station === "bridge" || a.station !== b.station ? "rgba(232,194,90,0.3)" : "rgba(130,170,200,0.14)";
        ctx.lineWidth = (hot ? 1.6 : 0.6 + Math.log1p(e.weight) / 4) / k;
        ctx.beginPath();
        ctx.moveTo(a.x!, a.y!);
        ctx.lineTo(b.x!, b.y!);
        ctx.stroke();
      }
      for (const n of data.nodes) {
        if (!on(n)) continue;
        ctx.globalAlpha = glow(n.id) ? 1 : 0.18;
        const col = STATION_COL[n.station] ?? "#ccc";
        // a glowing little planet: bright core, coloured body, soft halo
        const g = ctx.createRadialGradient(n.x! - n.r * 0.35, n.y! - n.r * 0.35, n.r * 0.1, n.x!, n.y!, n.r);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.35, col);
        g.addColorStop(1, col + "55");
        ctx.shadowColor = col;
        ctx.shadowBlur = (glow(n.id) ? 14 : 4) * Math.min(k, 1.5);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (lit?.seeds.has(n.id) || n.id === selId) {
          ctx.strokeStyle = "#e8c25a";
          ctx.lineWidth = 2.5 / k;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, n.r + 5 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
        const showLabel = n.id === selId || hover.current === n || (lit ? lit.seeds.has(n.id) || (k > 1.4 && lit.nodes.has(n.id)) : n.r > 11 || k > 1.8);
        if (showLabel) {
          ctx.fillStyle = "#eef2ff";
          ctx.shadowColor = "#000";
          ctx.shadowBlur = 4;
          ctx.font = `${12 / k}px "IBM Plex Mono", monospace`;
          ctx.fillText(n.label.length > 34 ? n.label.slice(0, 33) + "…" : n.label, n.x! + n.r + 3 / k, n.y! + 4 / k);
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();

    // pan, zoom, hover and click
    const toWorld = (cx: number, cy: number) => {
      const { x, y, k } = view.current;
      return [(cx - cv.clientWidth / 2 - x) / k, (cy - cv.clientHeight / 2 - y) / k];
    };
    const find = (cx: number, cy: number) => {
      const [wx, wy] = toWorld(cx, cy);
      let best: N | null = null, bd = Infinity;
      for (const n of data.nodes) {
        if (state.current.hidden.has(n.station)) continue;
        const d = Math.hypot(n.x! - wx, n.y! - wy);
        if (d < n.r + 4 / view.current.k && d < bd) (best = n), (bd = d);
      }
      return best;
    };
    let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false };
      cv.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        view.current.x = drag.vx + dx;
        view.current.y = drag.vy + dy;
      } else {
        hover.current = find(e.clientX - r.left, e.clientY - r.top);
        cv.style.cursor = hover.current ? "pointer" : "grab";
      }
    };
    const up = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      if (drag && !drag.moved) {
        const n = find(e.clientX - r.left, e.clientY - r.top);
        if (n) getJSON<NodeDetail>(`/graph/node/${encodeURIComponent(n.id)}`).then(setSel).catch(() => {});
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const cx = e.clientX - r.left - cv.clientWidth / 2, cy = e.clientY - r.top - cv.clientHeight / 2;
      const v = view.current;
      const k2 = Math.min(5, Math.max(0.25, v.k * Math.exp(-e.deltaY * 0.0015)));
      v.x = cx - ((cx - v.x) * k2) / v.k;
      v.y = cy - ((cy - v.y) * k2) / v.k;
      v.k = k2;
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    // start a little zoomed out on small screens
    view.current.k = cv.clientWidth < 700 ? 0.55 : 0.9;
    return () => {
      cancelAnimationFrame(raf);
      s.stop();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("wheel", wheel);
    };
  }, [data]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setQ(question);
    setBusy(true);
    setAnswer("");
    setAnswerErr(null);
    setFacts([]);
    setEvidence([]);
    setSel(null);
    try {
      await stream("/graph/ask", { question }, (ev, d) => {
        if (ev === "graph") setLit({ seeds: new Set(d.seeds), nodes: new Set(d.nodes) });
        else if (ev === "sources") {
          setFacts(d.facts);
          setEvidence(d.evidence);
        } else if (ev === "token") setAnswer((a) => a + d);
        else if (ev === "error") setAnswerErr(d);
      });
    } catch {
      setAnswerErr("Lost contact with the backend.");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.nodes.forEach((n) => (c[n.station] = (c[n.station] ?? 0) + 1));
    return c;
  }, [data]);

  return (
    <Shell current="/knowledge-map" station="knowledge-map" title="Knowledge Map" rag="GraphRAG: entity linking → graph expansion → evidence on every edge">
      <main className="st-main kmap">
        <section className="panel graph-wrap">
          {err ? (
            <div className="pad">
              <h2>No graph yet</h2>
              <p>{err}</p>
            </div>
          ) : (
            <canvas ref={canvas} className="graph" aria-label="Knowledge graph. Drag to pan, scroll to zoom, click a node." />
          )}
          <div className="graph-legend" role="group" aria-label="Show stations">
            {Object.keys(STATION_COL).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={!hidden.has(s)}
                onClick={() => setHidden((h) => { const n = new Set(h); n.has(s) ? n.delete(s) : n.add(s); return n; })}
              >
                <i style={{ background: STATION_COL[s] }} />
                {STATION_NAME[s]} <small>{counts[s] ?? 0}</small>
              </button>
            ))}
            {lit && (
              <button type="button" onClick={() => setLit(null)}>
                Clear highlight
              </button>
            )}
          </div>
          {data && (
            <p className="graph-count">
              {data.nodes.length} nodes · {data.edges.length} edges · drag, scroll, click
            </p>
          )}
        </section>

        <section className="panel pad side">
          <form
            className="askbar"
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question that crosses stations…" aria-label="Question" />
            <button type="submit" className="go" disabled={busy || !q.trim()}>
              Ask
            </button>
          </form>
          {!answer && !busy && !sel && (
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
          <Answer text={answer} count={evidence.length} busy={busy} error={answerErr} onCite={(n) => document.getElementById(`gev-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })} />
          {facts.length > 0 && (
            <details className="plan">
              <summary>Graph path used ({facts.length} facts)</summary>
              <ul className="facts-list">
                {facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </details>
          )}
          {evidence.length > 0 && (
            <ol className="sources">
              {evidence.map((e, i) => (
                <li key={`${e.type}-${e.id}`} id={`gev-${i + 1}`}>
                  <b>[{i + 1}]</b> <span className={`tag ${e.type}`}>{e.type}</span> {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> : e.title}
                  <p className="small muted">{e.text.slice(0, 220)}…</p>
                </li>
              ))}
            </ol>
          )}

          {sel && (
            <div className="node-card">
              <header>
                <span className="tag" style={{ background: STATION_COL[sel.station] }}>
                  {sel.kind}
                </span>
                <h2>{sel.label}</h2>
                <button type="button" onClick={() => setSel(null)} aria-label="Close">
                  ×
                </button>
              </header>
              <p className="small">{sel.description}</p>
              <button type="button" className="go small" onClick={() => ask(`What is ${sel.label} and what is it connected to?`)}>
                Ask about this
              </button>
              <h3>Connections</h3>
              <ul className="neighbors">
                {sel.neighbors.slice(0, 14).map((nb) => {
                  const other = nb.src === sel.id ? nb.dst : nb.src;
                  return (
                    <li key={other + nb.relation}>
                      <button type="button" onClick={() => getJSON<NodeDetail>(`/graph/node/${encodeURIComponent(other)}`).then(setSel)}>
                        <i style={{ background: STATION_COL[nb.station] }} />
                        {nb.src === sel.id ? nb.relation : `← ${nb.relation}`} <b>{nb.label}</b> <small>×{nb.weight}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {sel.evidence.length > 0 && (
                <>
                  <h3>Evidence</h3>
                  <ul className="sources">
                    {sel.evidence.map((e) => (
                      <li key={`${e.type}-${e.id}`}>
                        <span className={`tag ${e.type}`}>{e.type}</span> {e.title}
                        {e.start_met != null && <small className="mono"> {fmt(e.start_met)}</small>}
                        <p className="small muted">{e.text.slice(0, 200)}…</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {byId.size === 0 && !err && <p className="muted">Loading the graph…</p>}
        </section>
      </main>
    </Shell>
  );
}
