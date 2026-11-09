"use client";

// Text with [n] citations turned into buttons that point at numbered sources.

export function Cited({ text, count, onCite }: { text: string; count: number; onCite?: (n: number) => void }) {
  const parts = text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[(\d+(?:\s*,\s*\d+)*)\]$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        return m[1].split(",").map((s) => {
          const n = Number(s.trim());
          if (n < 1 || n > count) return null;
          return (
            <button key={`${i}-${n}`} type="button" className="cite" onClick={() => onCite?.(n)} aria-label={`Source ${n}`}>
              {n}
            </button>
          );
        });
      })}
    </>
  );
}
