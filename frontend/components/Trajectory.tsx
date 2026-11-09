"use client";

// The wall display: Earth, the Moon and Apollo 13's free-return path. The spacecraft
// marker moves along the path with mission time (outbound until closest approach to
// the Moon, then home).

import { useEffect, useRef, useState } from "react";
import { T } from "@/lib/met";

const PATH =
  "M 118 176 C 260 70, 520 70, 664 128 C 700 142, 742 170, 742 202 C 742 236, 704 262, 666 258 C 560 246, 300 330, 118 218";

function fraction(met: number) {
  if (met <= 0) return 0;
  if (met <= T.closestMoon) return 0.58 * (met / T.closestMoon);
  return Math.min(1, 0.58 + 0.42 * ((met - T.closestMoon) / (T.splashdown - T.closestMoon)));
}

export function Trajectory({ met, alarm }: { met: number; alarm: boolean }) {
  const ref = useRef<SVGPathElement>(null);
  const [pt, setPt] = useState({ x: 118, y: 176, len: 0, at: 0 });

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const len = p.getTotalLength();
    const at = fraction(met) * len;
    const q = p.getPointAtLength(at);
    setPt({ x: q.x, y: q.y, len, at });
  }, [met]);

  return (
    <svg className={`traj ${alarm ? "alarm" : ""}`} viewBox="0 0 840 330" role="img" aria-label="Apollo 13 position between Earth and the Moon">
      <defs>
        <radialGradient id="earth" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#7fd3ff" />
          <stop offset="0.6" stopColor="#2d6fb5" />
          <stop offset="1" stopColor="#173a66" />
        </radialGradient>
        <radialGradient id="moon" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#f2efe6" />
          <stop offset="1" stopColor="#8d8a82" />
        </radialGradient>
        <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M42 0H0V42" fill="none" stroke="var(--grid)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="840" height="330" fill="url(#grid)" />
      <path ref={ref} d={PATH} className="traj-path" />
      {pt.len > 0 && <path d={PATH} className="traj-done" style={{ strokeDasharray: `${pt.at} ${pt.len}` }} />}
      <circle cx="96" cy="196" r="44" fill="url(#earth)" />
      <text x="96" y="268" className="traj-label">Earth</text>
      <circle cx="704" cy="200" r="24" fill="url(#moon)" />
      <text x="704" y="248" className="traj-label">Moon</text>
      <g transform={`translate(${pt.x} ${pt.y})`}>
        <circle r="14" className="craft-ring" />
        <circle r="5" className="craft" />
      </g>
    </svg>
  );
}
