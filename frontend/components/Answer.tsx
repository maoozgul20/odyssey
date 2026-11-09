"use client";

import { Cited } from "@/components/Cited";

/** A streamed, cited answer with a blinking cursor while it is still arriving. */
export function Answer({
  text,
  count,
  busy,
  error,
  onCite,
  label = "Answer",
}: {
  text: string;
  count: number;
  busy: boolean;
  error?: string | null;
  onCite?: (n: number) => void;
  label?: string;
}) {
  if (!text && !busy && !error) return null;
  return (
    <div className="answer" aria-live="polite">
      <p className="answer-label">{label}</p>
      <div className="answer-text">
        {text ? <Cited text={text} count={count} onCite={onCite} /> : busy ? <span className="muted">Retrieving…</span> : null}
        {busy && <span className="cursor" aria-hidden="true" />}
      </div>
      {error && <p className="answer-err">{error}</p>}
    </div>
  );
}
