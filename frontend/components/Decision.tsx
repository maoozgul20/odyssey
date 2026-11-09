"use client";

// A crisis decision: the clock stops, you choose, then RAG pulls the real radio lines
// around that moment and FLIGHT explains what Mission Control actually decided.

import { useState } from "react";
import { Cited } from "@/components/Cited";
import { answerDecision, type Decision, type Verdict } from "@/lib/api";

export function DecisionModal({
  d,
  index,
  total,
  onDone,
  onJump,
}: {
  d: Decision;
  index: number;
  total: number;
  onDone: (v: Verdict | null) => void;
  onJump: (t: number) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const submit = async () => {
    if (!choice) return;
    setBusy(true);
    setErr(null);
    try {
      setVerdict(await answerDecision(d.id, choice));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reach the backend.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="decision" role="dialog" aria-modal="true" aria-labelledby="dec-title">
      <div className="decision-card">
        <p className="dec-kicker">
          Decision {index + 1} of {total} · MET {d.decide_at} · the clock is stopped
        </p>
        <h2 id="dec-title">{d.title}</h2>
        <p className="dec-q">{d.question}</p>

        <ul className="dec-options" role="radiogroup" aria-label="Your call">
          {d.options.map((o) => {
            const state = verdict ? (o.id === verdict.nasa_choice ? "nasa" : o.id === verdict.choice ? "wrong" : "") : choice === o.id ? "picked" : "";
            return (
              <li key={o.id}>
                <button type="button" role="radio" aria-checked={choice === o.id} disabled={!!verdict || busy} className={state} onClick={() => setChoice(o.id)}>
                  <b>{o.id.toUpperCase()}</b>
                  <span>{o.text}</span>
                  {verdict && o.id === verdict.nasa_choice && <em>What Houston did</em>}
                </button>
              </li>
            );
          })}
        </ul>

        {!verdict && (
          <div className="dec-actions">
            <button type="button" className="ghost" onClick={() => onDone(null)}>
              Skip
            </button>
            <button type="button" className="go" disabled={!choice || busy} onClick={submit}>
              {busy ? "Checking the transcript…" : "Make the call"}
            </button>
          </div>
        )}
        {err && <p className="dec-err">{err}</p>}

        {verdict && (
          <div className="dec-result">
            <p className={`dec-badge ${verdict.correct ? "ok" : "no"}`}>{verdict.correct ? "Same call as Houston" : "Houston chose differently"}</p>
            {verdict.explanation ? (
              <p className="dec-explain">
                <Cited text={verdict.explanation} count={verdict.evidence.length} onCite={(n) => setOpen(n)} />
              </p>
            ) : (
              <p className="dec-explain">{verdict.nasa_text}</p>
            )}
            <details className="dec-evidence" open={open !== null}>
              <summary>Evidence from the transcript ({verdict.evidence.length})</summary>
              <ol>
                {verdict.evidence.map((h, i) => (
                  <li key={h.id} className={open === i + 1 ? "hl" : ""}>
                    <header>
                      <b>[{i + 1}]</b> {h.start} to {h.end}
                      <button
                        type="button"
                        onClick={() => {
                          onDone(verdict);
                          onJump(h.start_met);
                        }}
                      >
                        Replay from here
                      </button>
                    </header>
                    <pre>{h.content}</pre>
                  </li>
                ))}
              </ol>
            </details>
            <div className="dec-actions">
              <button type="button" className="go" onClick={() => onDone(verdict)}>
                Continue mission
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const RANKS = [
  { min: 1, title: "Flight Director", note: "You made every call Gene Kranz's team made." },
  { min: 0.7, title: "Flight Controller", note: "Front-room material. A few calls went another way." },
  { min: 0.4, title: "Backroom Engineer", note: "Solid instincts; study the transcript for the rest." },
  { min: 0, title: "Trainee", note: "Replay the crisis and listen to how Houston reasoned." },
];

export function Debrief({
  decisions,
  results,
  onClose,
  onReplay,
}: {
  decisions: Decision[];
  results: Record<string, Verdict | "skipped">;
  onClose: () => void;
  onReplay: (t: number) => void;
}) {
  const answered = decisions.filter((d) => results[d.id] && results[d.id] !== "skipped");
  const right = answered.filter((d) => (results[d.id] as Verdict).correct).length;
  const ratio = answered.length ? right / answered.length : 0;
  const rank = RANKS.find((r) => ratio >= r.min)!;
  return (
    <div className="decision" role="dialog" aria-modal="true" aria-labelledby="deb-title">
      <div className="decision-card debrief">
        <p className="dec-kicker">Mission debrief</p>
        <h2 id="deb-title">
          {right} of {answered.length} calls matched Houston
        </h2>
        <p className="deb-rank">
          <b>{answered.length ? rank.title : "No calls made yet"}</b> {answered.length ? rank.note : "Play through the crisis to make decisions."}
        </p>
        <table className="deb-table">
          <thead>
            <tr>
              <th>MET</th>
              <th>Decision</th>
              <th>You</th>
              <th>Houston</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => {
              const r = results[d.id];
              const v = r && r !== "skipped" ? r : null;
              return (
                <tr key={d.id} className={v ? (v.correct ? "ok" : "no") : "nr"}>
                  <td>
                    <button type="button" onClick={() => onReplay(d.decide_met - 60)}>
                      {d.decide_at}
                    </button>
                  </td>
                  <td>{d.title}</td>
                  <td>{v ? v.choice.toUpperCase() : r === "skipped" ? "skipped" : "not reached"}</td>
                  <td>{v ? v.nasa_choice.toUpperCase() : "?"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="dec-actions">
          <button type="button" className="go" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
