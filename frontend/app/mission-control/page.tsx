"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Comms } from "@/components/Comms";
import { Debrief, DecisionModal } from "@/components/Decision";
import { SpaceScene } from "@/components/SpaceScene";
import { Brand } from "@/components/StationNav";
import { Radio } from "@/components/Radio";
import { Timeline } from "@/components/Timeline";
import { Trajectory } from "@/components/Trajectory";
import { getDecisions, getLines, getMission, type Decision, type Line, type Mission, type Verdict } from "@/lib/api";
import { fmt, get, parse, T } from "@/lib/met";
import { systems } from "@/lib/systems";

const SPEEDS = [1, 10, 60, 600];
const STARTS = [
  { label: "Lift-off", note: "April 11, 1970, Kennedy Space Center", t: parse("-00:00:00:12") },
  { label: "Minutes before the explosion", note: "A routine evening, 200,000 miles out", t: parse("02:07:50:00") },
  { label: "The CO₂ crisis", note: "Building a filter from tape and cardboard", t: parse("03:18:05:00") },
  { label: "Coming home", note: "Re-entry and splashdown", t: parse("05:21:20:00") },
];

/** A two-tone klaxon made with the Web Audio API, so there is no sound file. */
function useKlaxon() {
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }, []);
  const start = useCallback(() => {
    try {
      ctx.current ??= new AudioContext();
      const c = ctx.current;
      let hi = true;
      const beep = () => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "square";
        o.frequency.value = hi ? 880 : 660;
        hi = !hi;
        g.gain.setValueAtTime(0.05, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.32);
        o.connect(g).connect(c.destination);
        o.start();
        o.stop(c.currentTime + 0.34);
      };
      stop();
      beep();
      timer.current = window.setInterval(beep, 380);
    } catch {}
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { start, stop };
}

export default function MissionControl() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [met, setMet] = useState(STARTS[1].t);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cache, setCache] = useState<{ from: number; to: number; lines: Line[] }>({ from: 0, to: -1, lines: [] });
  const [alarm, setAlarm] = useState(false);
  const [muted, setMuted] = useState(false);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [results, setResults] = useState<Record<string, Verdict | "skipped">>({});
  const [pending, setPending] = useState<Decision | null>(null);
  const [decisionsOn, setDecisionsOn] = useState(true);
  const [debrief, setDebrief] = useState(false);
  const decRef = useRef<{ list: Decision[]; done: Record<string, unknown>; on: boolean }>({ list: [], done: {}, on: true });
  decRef.current = { list: decisions, done: results, on: decisionsOn };
  const loading = useRef(false);
  const klaxon = useKlaxon();
  const metRef = useRef(met);
  metRef.current = met;

  useEffect(() => {
    getMission()
      .then(setMission)
      .catch(() => setError("Mission Control can't reach the backend. Start it with: uvicorn app.main:app --port 8000"));
    getDecisions()
      .then(setDecisions)
      .catch(() => {});
    try {
      const saved = localStorage.getItem("odyssey.decisions");
      if (saved) setResults(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("odyssey.decisions", JSON.stringify(results));
    } catch {}
  }, [results]);

  // the mission clock
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setMet((m) => {
        const next = m + dt * speed;
        // the master alarm, when the clock crosses the moment the crew calls in the problem
        if (m < T.explosion && next >= T.explosion) {
          setAlarm(true);
        }
        // a crisis decision: stop the clock exactly there and ask the player
        const { list, done, on } = decRef.current;
        const d = on ? list.find((x) => !done[x.id] && m < x.decide_met && next >= x.decide_met) : undefined;
        if (d) {
          setPlaying(false);
          setPending(d);
          return d.decide_met;
        }
        if (next >= T.splashdown + 120) {
          setPlaying(false);
          setDebrief(true);
          return T.splashdown + 120;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  useEffect(() => {
    if (alarm && !muted) klaxon.start();
    else klaxon.stop();
  }, [alarm, muted, klaxon]);

  // keep the radio lines around the clock loaded
  useEffect(() => {
    if (!started || loading.current) return;
    if (met >= cache.from && met <= cache.to - 300) return;
    loading.current = true;
    const from = met - 3600;
    const to = met + 6 * 3600;
    getLines(from, to)
      .then((lines) => {
        const last = lines.length === 1000 ? lines[lines.length - 1].met : to;
        setCache({ from, to: last, lines });
      })
      .catch(() => setError("Lost contact with the backend while loading the radio loop."))
      .finally(() => (loading.current = false));
  }, [met, started, cache.from, cache.to]);

  const heard = useMemo(() => cache.lines.filter((l) => l.met <= met).slice(-150), [cache.lines, met]);
  const nextLine = useMemo(() => cache.lines.find((l) => l.met > met), [cache.lines, met]);
  const silence = nextLine ? nextLine.met - met : 0;

  const seek = (t: number) => {
    const clamped = Math.max(STARTS[0].t, Math.min(t, T.splashdown + 120));
    setAlarm(false);
    setMet(clamped);
  };

  const act = mission?.acts.find((a) => met >= a.start_met && met < a.end_met) ?? mission?.acts[mission.acts.length - 1];
  const nextScene = mission?.key_scenes.find((s) => s.start_met > met);
  const lights = systems(met);

  if (error && !mission) {
    return (
      <main className="fatal">
        <h1>No signal</h1>
        <p>{error}</p>
        <p className="small">Then reload this page.</p>
      </main>
    );
  }

  return (
    <div className={`mocr ${alarm ? "is-alarm" : ""}`}>
      <SpaceScene variant="ambient" />
      <header className="top">
        <Brand current="/mission-control" />

        <div className="clock" aria-live="off">
          <span className="clock-label">MET</span>
          <span className="clock-digits">{fmt(met)}</span>
          <span className="clock-get">GET {get(met)}</span>
        </div>

        <div className="controls">
          <button type="button" className="play" onClick={() => setPlaying(!playing)} disabled={!started} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="speeds" role="group" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <button type="button" className="mute" onClick={() => setMuted(!muted)} aria-pressed={muted}>
            {muted ? "Sound off" : "Sound on"}
          </button>
          <button type="button" className="mute" onClick={() => setDecisionsOn(!decisionsOn)} aria-pressed={decisionsOn} title="Stop the clock at each crisis decision">
            Decisions {decisionsOn ? "on" : "off"}
          </button>
          <button type="button" className="mute debrief-btn" onClick={() => { setPlaying(false); setDebrief(true); }}>
            Debrief {Object.values(results).filter((r) => r !== "skipped" && (r as Verdict).correct).length}/{decisions.length || 7}
          </button>
        </div>
      </header>

      {mission && (
        <Timeline acts={mission.acts} scenes={mission.key_scenes} met={met} start={STARTS[0].t} end={T.splashdown + 120} onSeek={seek} />
      )}

      <main className="grid">
        <section className="panel loop" aria-label="Air-to-ground loop">
          <header className="panel-head">
            <h2>Air-to-ground loop</h2>
            <span className="hint">{act?.title}</span>
          </header>
          <Radio
            lines={heard}
            onAsk={(l) => setPrefill((p) => ({ text: `What did ${l.speaker === "CC" ? "CapCom" : "the crew"} mean at ${l.time}: “${l.text.slice(0, 120)}”?`, n: (p?.n ?? 0) + 1 }))}
          />
          {playing && silence > 90 && nextLine && (
            <button type="button" className="skip" onClick={() => seek(nextLine.met - 3)}>
              Silence for {Math.round(silence / 60)} min. Skip to {nextLine.time}
            </button>
          )}
        </section>

        <section className="panel wall" aria-label="Flight dynamics">
          <header className="panel-head">
            <h2>Flight dynamics</h2>
            <span className="hint">{nextScene ? `Next: ${nextScene.title.replace(/<[^>]+>/g, "")}` : "Mission complete"}</span>
          </header>
          <Trajectory met={met} alarm={alarm} />
          <div className="annunciators" aria-label="Spacecraft systems">
            <div className={`ann master ${alarm ? "warning blink" : "off"}`}>
              <b>Master alarm</b>
              <small>{alarm ? "Active" : "Clear"}</small>
            </div>
            {lights.map((l) => (
              <div key={l.id} className={`ann ${l.state}`}>
                <b>{l.label}</b>
                <small>{l.text}</small>
              </div>
            ))}
          </div>
          {alarm && (
            <div className="alarm-bar" role="alert">
              <span>
                <b>02:07:55</b> Houston, we&apos;ve had a problem. Main bus B undervolt.
              </span>
              <button type="button" onClick={() => setAlarm(false)}>
                Acknowledge
              </button>
            </div>
          )}
        </section>

        <Comms met={met} prefill={prefill} onJump={(t) => seek(t - 2)} onAnswered={() => {}} />
      </main>

      {pending && (
        <DecisionModal
          key={pending.id}
          d={pending}
          index={decisions.findIndex((x) => x.id === pending.id)}
          total={decisions.length}
          onJump={(t) => seek(t - 2)}
          onDone={(v) => {
            setResults((r) => ({ ...r, [pending.id]: v ?? "skipped" }));
            setPending(null);
            setMet((m) => m + 1);
            setPlaying(true);
          }}
        />
      )}

      {debrief && (
        <Debrief
          decisions={decisions}
          results={results}
          onClose={() => setDebrief(false)}
          onReplay={(t) => {
            const d = decisions.find((x) => x.decide_met - 60 === t);
            if (d) setResults((r) => { const n = { ...r }; delete n[d.id]; return n; });
            setDebrief(false);
            seek(t);
            setStarted(true);
            setPlaying(true);
          }}
        />
      )}

      {!started && (
        <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
          <div className="intro-card">
            <p className="intro-date">Houston, April 1970</p>
            <h1 id="intro-title">You are on console.</h1>
            <p>
              Apollo 13 is on its way to the Moon. You will hear every word between the crew and Mission Control, in mission time. Talk to the
              astronauts at any moment: they only know what has been said so far.
            </p>
            <ul>
              {STARTS.map((s) => (
                <li key={s.label}>
                  <button
                    type="button"
                    disabled={!mission}
                    onClick={() => {
                      setMet(s.t);
                      setStarted(true);
                      setPlaying(true);
                    }}
                  >
                    <b>{s.label}</b>
                    <span>{s.note}</span>
                    <time>{fmt(s.t)}</time>
                  </button>
                </li>
              ))}
            </ul>
            {!mission && <p className="small">Contacting the backend…</p>}
          </div>
        </div>
      )}
    </div>
  );
}
