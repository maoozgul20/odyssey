"use client";

import type { Act, Scene } from "@/lib/api";
import { fmt } from "@/lib/met";

export function Timeline({
  acts,
  scenes,
  met,
  start,
  end,
  onSeek,
}: {
  acts: Act[];
  scenes: Scene[];
  met: number;
  start: number;
  end: number;
  onSeek: (t: number) => void;
}) {
  const pos = (t: number) => `${((t - start) / (end - start)) * 100}%`;
  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(start + ((e.clientX - r.left) / r.width) * (end - start));
  };
  return (
    <div className="timeline">
      <div
        className="tl-track"
        onClick={seekFromEvent}
        role="slider"
        aria-label="Mission time"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={Math.round(met)}
        aria-valuetext={fmt(met)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(met + 600);
          if (e.key === "ArrowLeft") onSeek(met - 600);
        }}
      >
        {acts.map((a) => (
          <span
            key={a.idx}
            className={`tl-act ${met >= a.start_met && met < a.end_met ? "now" : ""}`}
            style={{ left: pos(a.start_met), width: `calc(${pos(a.end_met)} - ${pos(a.start_met)})` }}
            title={`${a.title}: ${fmt(a.start_met)} to ${fmt(a.end_met)}`}
          >
            <em>{a.title}</em>
          </span>
        ))}
        <span className="tl-head" style={{ left: pos(met) }} />
      </div>
      <div className="tl-scenes">
        {scenes.map((s) => (
          <button
            key={s.idx}
            type="button"
            className={`tl-scene ${met >= s.start_met ? "past" : ""}`}
            style={{ left: pos(s.start_met) }}
            onClick={() => onSeek(s.start_met - 20)}
            title={`${fmt(s.start_met)}: ${s.title.replace(/<[^>]+>/g, "")}`}
            aria-label={`Jump to ${s.title.replace(/<[^>]+>/g, "")}`}
          />
        ))}
      </div>
    </div>
  );
}
