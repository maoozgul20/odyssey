"use client";

// Comms: talk to FLIGHT (the AI historian) or to the crew. Everyone only knows what has
// been said on the loop up to the current mission time.

import { useEffect, useRef, useState } from "react";
import { ask, type Hit, type Sources } from "@/lib/api";
import { fmt } from "@/lib/met";

export type Persona = { id: string; name: string; role: string; mode: "flight" | "crew"; code?: string };

export const PERSONAS: Persona[] = [
  { id: "FLIGHT", name: "FLIGHT", role: "AI flight historian", mode: "flight" },
  { id: "CDR", name: "Jim Lovell", role: "Commander", mode: "crew", code: "CDR" },
  { id: "LMP", name: "Fred Haise", role: "Lunar Module Pilot", mode: "crew", code: "LMP" },
  { id: "CMP", name: "Jack Swigert", role: "Command Module Pilot", mode: "crew", code: "CMP" },
  { id: "CC", name: "CapCom", role: "Mission Control, Houston", mode: "crew", code: "CC" },
];

type Msg = {
  id: number;
  who: string; // persona id, or "you"
  text: string;
  at: number; // mission time it was asked at
  sources?: Sources;
  error?: string;
  streaming?: boolean;
};

function Reply({ msg, onJump }: { msg: Msg; onJump: (t: number) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const hits = msg.sources?.hits ?? [];
  const parts = msg.text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
  return (
    <>
      <p className="m-text">
        {parts.map((p, i) => {
          const m = /^\[(\d+(?:\s*,\s*\d+)*)\]$/.exec(p);
          if (!m) return <span key={i}>{p}</span>;
          return m[1].split(",").map((n) => {
            const k = Number(n.trim());
            if (!hits[k - 1]) return <span key={`${i}-${k}`}>[{k}]</span>;
            return (
              <button key={`${i}-${k}`} type="button" className="cite" onClick={() => setOpen(open === k ? null : k)} aria-expanded={open === k}>
                {k}
              </button>
            );
          });
        })}
        {msg.streaming && <span className="cursor" aria-hidden="true" />}
      </p>
      {msg.error && <p className="m-error">{msg.error}</p>}
      {open != null && hits[open - 1] && <Evidence hit={hits[open - 1]} n={open} onJump={onJump} />}
      {msg.sources && !msg.streaming && (
        <div className="m-meta">
          {msg.sources.rewritten && <span className="chip">Searched for: {msg.sources.query}</span>}
          <span className={`chip ${msg.sources.covered ? "ok" : "warn"}`}>{msg.sources.covered ? "Found in the transcript" : "Weak evidence"}</span>
          <details>
            <summary>{hits.length} excerpts</summary>
            {hits.map((h, i) => (
              <Evidence key={h.id} hit={h} n={i + 1} onJump={onJump} />
            ))}
          </details>
        </div>
      )}
    </>
  );
}

function Evidence({ hit, n, onJump }: { hit: Hit; n: number; onJump: (t: number) => void }) {
  return (
    <div className="ev">
      <div className="ev-head">
        <span className="ev-n">{n}</span>
        <span>
          {hit.start} to {hit.end}
        </span>
        <button type="button" onClick={() => onJump(hit.start_met)}>
          Replay from here
        </button>
      </div>
      <pre>{hit.content}</pre>
    </div>
  );
}

export function Comms({
  met,
  prefill,
  onJump,
  onAnswered,
}: {
  met: number;
  prefill: { text: string; n: number } | null;
  onJump: (t: number) => void;
  onAnswered: () => void;
}) {
  const [persona, setPersona] = useState<Persona>(PERSONAS[1]);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const list = useRef<HTMLOListElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!prefill) return;
    setPersona(PERSONAS[0]);
    setInput(prefill.text);
    field.current?.focus();
  }, [prefill]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    const at = Math.floor(met);
    const id = nextId.current;
    nextId.current += 2;
    const p = persona;
    setMsgs((m) => [...m, { id, who: "you", text: q, at }, { id: id + 1, who: p.id, text: "", at, streaming: true }]);
    setInput("");
    setBusy(true);
    const patch = (fn: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m) => (m.id === id + 1 ? fn(m) : m)));
    try {
      await ask(
        { question: q, mode: p.mode, persona: p.code, max_met: at, k: 5 },
        {
          sources: (s) => patch((m) => ({ ...m, sources: s })),
          token: (t) => patch((m) => ({ ...m, text: m.text + t })),
          error: (e) => patch((m) => ({ ...m, error: e })),
        },
      );
    } catch (e) {
      patch((m) => ({ ...m, error: e instanceof Error ? e.message : "The backend could not be reached." }));
    }
    patch((m) => ({ ...m, streaming: false }));
    setBusy(false);
    onAnswered();
  };

  return (
    <section className="panel comms" aria-label="Comms">
      <header className="panel-head">
        <h2>Comms</h2>
        <span className="hint">Knows only what was said before {fmt(met)}</span>
      </header>
      <div className="who" role="tablist" aria-label="Talk to">
        {PERSONAS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={persona.id === p.id} className={persona.id === p.id ? "on" : ""} onClick={() => setPersona(p)}>
            <b>{p.name}</b>
            <small>{p.role}</small>
          </button>
        ))}
      </div>
      <ol className="msgs" ref={list}>
        {msgs.length === 0 && (
          <li className="m-empty">
            Pick someone and ask a question. Try “What just happened?” right after 02:07:55, or “How much power do we have left?”
          </li>
        )}
        {msgs.map((m) => {
          const p = PERSONAS.find((x) => x.id === m.who);
          return (
            <li key={m.id} className={`m ${m.who === "you" ? "you" : "them"}`}>
              <span className="m-who">
                {m.who === "you" ? "You" : p?.name} <time>{fmt(m.at)}</time>
              </span>
              {m.who === "you" ? <p className="m-text">{m.text}</p> : <Reply msg={m} onJump={onJump} />}
            </li>
          );
        })}
      </ol>
      <form
        className="say"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="say" className="sr-only">
          Message to {persona.name}
        </label>
        <textarea
          id="say"
          ref={field}
          rows={2}
          value={input}
          maxLength={1000}
          placeholder={`Talk to ${persona.name}…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" disabled={!input.trim() || busy}>
          {busy ? "Receiving…" : "Transmit"}
        </button>
      </form>
    </section>
  );
}
