"use client";

import { useEffect, useRef, useState } from "react";
import { Cited } from "@/components/Cited";
import { Shell } from "@/components/Shell";
import { post, stream } from "@/lib/api";

type P = { name: string; radius: number; mass: number; period: number; insolation: number; star_teff: number; atmosphere: string; water: string };
type Card = P & { eq_temp: number; size_class: string; in_hz: boolean; esi: number | null; density: number; description: string };
type Analog = { name: string; host: string; radius: number; mass: number; period: number; insolation: number; eq_temp: number; esi: number | null; in_hz: boolean; distance: number; dist_pc: number | null };
type Paper = { id: string; title: string; published: string | null; url: string; rerank: number };
type Turn = { role: string; name: string; title: string; text: string };

const PRESETS: { label: string; p: Partial<P> }[] = [
  { label: "Earth twin", p: { radius: 1, mass: 1, period: 365, insolation: 1, star_teff: 5772, atmosphere: "nitrogen-oxygen", water: "oceans" } },
  { label: "Red-dwarf world", p: { radius: 1.1, mass: 1.3, period: 12, insolation: 0.7, star_teff: 3100, atmosphere: "thin CO2", water: "unknown" } },
  { label: "Hycean sub-Neptune", p: { radius: 2.6, mass: 8.6, period: 33, insolation: 1.0, star_teff: 3450, atmosphere: "hydrogen", water: "global ocean" } },
  { label: "Lava planet", p: { radius: 1.8, mass: 8, period: 0.8, insolation: 2400, star_teff: 5200, atmosphere: "none", water: "none" } },
  { label: "Frozen super-Earth", p: { radius: 1.6, mass: 5, period: 600, insolation: 0.12, star_teff: 4500, atmosphere: "thick CO2", water: "ice" } },
];

// sliders on a log scale, because planets span huge ranges
const SLIDERS: { key: keyof P; label: string; min: number; max: number; unit: string; log: boolean }[] = [
  { key: "radius", label: "Radius", min: 0.3, max: 20, unit: "Earth radii", log: true },
  { key: "mass", label: "Mass", min: 0.05, max: 3000, unit: "Earth masses", log: true },
  { key: "period", label: "Orbit", min: 0.5, max: 5000, unit: "days", log: true },
  { key: "insolation", label: "Starlight", min: 0.01, max: 3000, unit: "× Earth", log: true },
  { key: "star_teff", label: "Star temperature", min: 2400, max: 9000, unit: "K", log: false },
];

function starColor(t: number) {
  if (t < 3500) return "#ff8a5c";
  if (t < 5000) return "#ffb26b";
  if (t < 6000) return "#fff1c9";
  if (t < 7500) return "#f4f6ff";
  return "#b9d2ff";
}
function planetColor(c: Card | null) {
  if (!c) return ["#3a6", "#164"];
  const t = c.eq_temp;
  if (c.size_class === "Gas giant" || c.size_class === "Neptune-like") return t > 700 ? ["#ffb648", "#8a3b12"] : ["#8fb6ff", "#24407a"];
  if (t > 800) return ["#ff6a3d", "#5a1206"];
  if (t > 330) return ["#d9a066", "#5c3a1b"];
  if (t < 200) return ["#e8f2ff", "#7d93b3"];
  return c.water !== "none" && c.water !== "unknown" ? ["#4fb3ff", "#155a2e"] : ["#6fbf73", "#2c4f37"];
}

const DEFAULT: P = { name: "Odyssey b", radius: 1.1, mass: 1.3, period: 12, insolation: 0.7, star_teff: 3100, atmosphere: "thin CO2", water: "unknown" };

export default function PlanetLab() {
  const [p, setP] = useState<P>(DEFAULT);
  const [card, setCard] = useState<Card | null>(null);
  const [analogs, setAnalogs] = useState<Analog[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [debAnalogs, setDebAnalogs] = useState<Analog[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  // live: recompute the planet card and its real analogs as the sliders move
  useEffect(() => {
    const t = window.setTimeout(() => {
      post<{ planet: Card; analogs: Analog[] }>("/lab/similar", p)
        .then((d) => {
          setCard(d.planet);
          setAnalogs(d.analogs);
          setErr(null);
        })
        .catch(() => setErr("Planet Lab needs the backend and the planets table (python scripts/ingest_exoplanets.py)."));
    }, 250);
    return () => window.clearTimeout(t);
  }, [p]);

  const convene = async () => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setTurns([]);
    setScore(null);
    setPapers([]);
    try {
      await stream(
        "/lab/debate",
        p,
        (ev, data) => {
          if (ev === "sources") {
            setPapers(data.papers);
            setDebAnalogs(data.analogs);
          } else if (ev === "turn") setTurns((t) => [...t, { ...data, text: "" }]);
          else if (ev === "token") setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, text: x.text + data.t } : x)));
          else if (ev === "score") setScore(data);
          else if (ev === "error") setTurns((t) => [...t, { role: "error", name: "Panel", title: "", text: data }]);
        },
        c.signal,
      );
    } catch {
      if (!c.signal.aborted) setTurns((t) => [...t, { role: "error", name: "Panel", title: "", text: "Lost contact with the backend." }]);
    } finally {
      setBusy(false);
    }
  };

  const nSources = papers.length + debAnalogs.length;
  const [hi, lo] = planetColor(card);
  const size = 60 + Math.min(90, Math.log2(1 + p.radius) * 45);

  return (
    <Shell current="/planet-lab" station="planet-lab" title="Planet Lab" rag="Analog retrieval + paper RAG + a three-agent scientific debate">
      <main className="st-main lab">
        <section className="panel pad builder">
          <header className="panel-head">
            <h2>Build a planet</h2>
            <input className="name" value={p.name} maxLength={40} onChange={(e) => setP({ ...p, name: e.target.value })} aria-label="Planet name" />
          </header>
          <ul className="chips">
            {PRESETS.map((x) => (
              <li key={x.label}>
                <button type="button" onClick={() => setP({ ...p, ...x.p })}>
                  {x.label}
                </button>
              </li>
            ))}
          </ul>
          {SLIDERS.map((s) => {
            const v = p[s.key] as number;
            const toPos = (x: number) => (s.log ? (Math.log10(x) - Math.log10(s.min)) / (Math.log10(s.max) - Math.log10(s.min)) : (x - s.min) / (s.max - s.min));
            const fromPos = (t: number) => (s.log ? 10 ** (Math.log10(s.min) + t * (Math.log10(s.max) - Math.log10(s.min))) : s.min + t * (s.max - s.min));
            return (
              <label key={s.key} className="slider">
                <span>
                  {s.label} <b>{v >= 100 ? v.toFixed(0) : v.toPrecision(3)}</b> <small>{s.unit}</small>
                </span>
                <input type="range" min={0} max={1000} value={Math.round(toPos(v) * 1000)} onChange={(e) => setP({ ...p, [s.key]: Number(fromPos(Number(e.target.value) / 1000).toPrecision(4)) })} />
              </label>
            );
          })}
          <div className="selects">
            <label>
              Atmosphere
              <select value={p.atmosphere} onChange={(e) => setP({ ...p, atmosphere: e.target.value })}>
                {["unknown", "none", "thin CO2", "thick CO2", "nitrogen-oxygen", "hydrogen", "steam"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Water
              <select value={p.water} onChange={(e) => setP({ ...p, water: e.target.value })}>
                {["unknown", "none", "ice", "lakes", "oceans", "global ocean"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel viz">
          <div className="system" aria-hidden="true">
            <div className="star" style={{ background: `radial-gradient(circle, #fff 0%, ${starColor(p.star_teff)} 35%, transparent 70%)` }} />
            <div
              className="planet"
              style={{
                width: size,
                height: size,
                background: `radial-gradient(circle at 32% 30%, ${hi}, ${lo} 70%, #05070a 100%)`,
                boxShadow: p.atmosphere !== "none" && p.atmosphere !== "unknown" ? `0 0 ${size / 3}px ${hi}66` : "none",
              }}
            />
          </div>
          {card && (
            <dl className="facts big">
              <dt>Type</dt>
              <dd>{card.size_class}</dd>
              <dt>Temperature</dt>
              <dd>{card.eq_temp} K</dd>
              <dt>Habitable zone</dt>
              <dd className={card.in_hz ? "ok" : "no"}>{card.in_hz ? "inside" : "outside"}</dd>
              <dt>Earth Similarity</dt>
              <dd>{card.esi ?? "—"}</dd>
              <dt>Density</dt>
              <dd>{card.density} g/cm³</dd>
            </dl>
          )}
          {err && <p className="answer-err pad">{err}</p>}
          <div className="analogs">
            <h3>Closest real planets</h3>
            <ol>
              {analogs.map((a) => (
                <li key={a.name}>
                  <b>{a.name}</b>
                  <span>
                    {a.radius?.toPrecision(2) ?? "?"} R⊕ · {a.eq_temp ? `${Math.round(a.eq_temp)} K` : "?"} · {a.dist_pc ? `${Math.round(a.dist_pc * 3.26)} ly` : ""}
                  </span>
                  <i style={{ width: `${Math.max(6, 100 - a.distance * 60)}%` }} title={`feature distance ${a.distance}`} />
                </li>
              ))}
            </ol>
          </div>
          <button type="button" className="go wide" onClick={convene} disabled={busy || !card}>
            {busy ? "The panel is debating…" : "Convene the science panel"}
          </button>
        </section>

        <section className="panel pad debate">
          <header className="panel-head">
            <h2>Science panel</h2>
            <span className="hint">every claim must cite the retrieved evidence</span>
          </header>
          {turns.length === 0 && !busy && <p className="muted">Shape your planet, then convene the panel: an optimist, a skeptic and a chair who scores it.</p>}
          {score !== null && (
            <div className="score" style={{ ["--s" as string]: score }}>
              <b>{score}</b>
              <span>/100 habitability</span>
            </div>
          )}
          <ol className="turns">
            {turns.map((t, i) => (
              <li key={i} className={`turn ${t.role}`}>
                <header>
                  <b>{t.name}</b> <span>{t.title}</span>
                </header>
                <p>
                  <Cited text={t.text.replace(/Habitability score:.*$/im, "").trim()} count={nSources} />
                  {busy && i === turns.length - 1 && <span className="cursor" aria-hidden="true" />}
                </p>
              </li>
            ))}
          </ol>
          {nSources > 0 && (
            <details className="dec-evidence">
              <summary>Evidence the panel was given ({nSources})</summary>
              <ol className="sources">
                {papers.map((x, i) => (
                  <li key={x.id}>
                    <b>[{i + 1}]</b>{" "}
                    <a href={x.url} target="_blank" rel="noreferrer">
                      {x.title}
                    </a>
                  </li>
                ))}
                {debAnalogs.map((a, i) => (
                  <li key={a.name}>
                    <b>[{papers.length + i + 1}]</b> {a.name} (real planet in the archive)
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      </main>
    </Shell>
  );
}
