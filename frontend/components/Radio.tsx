"use client";

// The air-to-ground loop: radio lines appear as mission time passes them.

import { useEffect, useRef } from "react";
import type { Line } from "@/lib/api";

const WHO: Record<string, string> = {
  CC: "CAPCOM",
  CDR: "LOVELL",
  LMP: "HAISE",
  CMP: "SWIGERT",
  F: "FLIGHT",
  LCC: "LAUNCH",
  SC: "CREW",
};

export function Radio({ lines, onAsk }: { lines: Line[]; onAsk: (l: Line) => void }) {
  const box = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <ol
      className="radio"
      ref={box}
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
    >
      {lines.length === 0 && <li className="radio-empty">Silence on the loop.</li>}
      {lines.map((l) => (
        <li key={`${l.met}-${l.speaker}-${l.text.slice(0, 12)}`} className={`rl spk-${l.speaker} ${l.key_line ? "key" : ""}`}>
          <time>{l.time}</time>
          <b>{WHO[l.speaker] ?? l.speaker}</b>
          <span className="txt">{l.text}</span>
          <button type="button" className="rl-ask" onClick={() => onAsk(l)} aria-label="Ask FLIGHT about this line">
            Ask
          </button>
        </li>
      ))}
    </ol>
  );
}
