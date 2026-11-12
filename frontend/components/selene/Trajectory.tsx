"use client";

import { useEffect, useRef, useState } from "react";
import { trajectory } from "./content";
import { clamp, easeOutCubic, lerp, pinProgress, range } from "@/lib/math";
import { onFrame } from "@/lib/scroll";

/**
 * Earth → Moon, drawn as you scroll. The section pins while the four legs of
 * the flight ink themselves one after another, a capsule riding the leg
 * being drawn; the distance flown ticks up to 384,400 km during the
 * coast. The Earth is cut from the hero's own Earth layer.
 */

const SECTION_VH = 380;
const WINDOW = [0.06, 0.92] as const;
const FROM = 28; // Hit@3 of plain semantic search (%)
const TO = 44; // Hit@3 after hybrid retrieval + rerank (%)

const EARTH = {cx: 230, cy: 320, r: 92};
const MOON = {cx: 985, cy: 300, r: 46};

const LEGS = [
  // Parking orbit: a lap and a bit around the Earth.
  `M${EARTH.cx} ${EARTH.cy - 128} a128 128 0 1 1 -0.1 0 a128 128 0 0 1 106 57`,
  // Trans-lunar coast.
  `M${EARTH.cx + 106} ${EARTH.cy - 71} C 520 40, 820 70, ${MOON.cx - 20} ${MOON.cy - 84}`,
  // Capture into lunar orbit.
  `M${MOON.cx - 20} ${MOON.cy - 84} a86 86 0 1 1 -0.1 0.2 a86 86 0 0 1 20 1`,
  // Descent to the surface.
  `M${MOON.cx} ${MOON.cy - 86} Q ${MOON.cx + 40} ${MOON.cy - 70} ${MOON.cx + 30} ${MOON.cy - 36}`,
];

// Where the Earth sits inside the 2688×1520 hero layer (measured from its alpha).
const LAYER = {cx: 0.657, cy: 0.498, d: 0.401};

export function Trajectory() {
  const rootRef = useRef<HTMLElement>(null);
  const legRefs = useRef<SVGPathElement[]>([]);
  const capsuleRef = useRef<SVGGElement>(null);
  const kmRef = useRef<HTMLSpanElement>(null);
  const [leg, setLeg] = useState(0);

  useEffect(() => {
    let lastP = -1;
    let current = 0;
    return onFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const {p, rect, vh} = pinProgress(root);
      if (rect.bottom < 0 || rect.top > vh) return;
      if (Math.abs(p - lastP) < 0.00005) return;
      lastP = p;

      const u = range(p, ...WINDOW) * LEGS.length;
      const s = clamp(Math.floor(u), 0, LEGS.length - 1);
      if (s !== current) {
        current = s;
        setLeg(s);
      }
      legRefs.current.forEach((path, i) => {
        const k = easeOutCubic(clamp(u - i));
        path.style.strokeDashoffset = String(1 - k);
        if (i === s) {
          const pt = path.getPointAtLength(path.getTotalLength() * k);
          capsuleRef.current!.setAttribute('transform', `translate(${pt.x} ${pt.y})`);
        }
      });
      const gain = easeOutCubic(clamp(u - 1.6));
      kmRef.current!.textContent = String(Math.round(lerp(FROM, TO, gain)));
    });
  }, []);

  const current = trajectory.legs[leg];
  const earthW = (EARTH.r * 2) / LAYER.d;
  const earthH = earthW * (1520 / 2688);

  return (
    <section ref={rootRef} id="trajectory" aria-labelledby="trajectory-title" className="sl-section sl-traj" style={{height: `${SECTION_VH}svh`}}>
      <div className="sl-sticky sl-traj-sticky">
        <div className="sl-traj-head">
          <div>
            <p className="sl-eyebrow">{trajectory.eyebrow}</p>
            <h2 id="trajectory-title" className="sl-h2 narrow">
              {trajectory.heading}
            </h2>
          </div>
          <p className="sl-readout" aria-live="off">
            Hit@3 <span ref={kmRef} className="v">{FROM}</span>% <span className="dim">· 28 test questions</span>
          </p>
        </div>

        <div className="sl-traj-art">
          <svg viewBox="0 0 1200 600" className="sl-traj-svg" role="img" aria-label="The path of a question to its answer, drawn in four steps.">
            <defs>
              <clipPath id="earth-clip">
                <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r} />
              </clipPath>
              <radialGradient id="moon-shade" cx="35%" cy="35%" r="75%">
                <stop offset="0" stopColor="#e4e6ea" />
                <stop offset="0.7" stopColor="#8b909b" />
                <stop offset="1" stopColor="#2a2e36" />
              </radialGradient>
              <radialGradient id="earth-glow">
                <stop offset="0.8" stopColor="#6fb6ff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#6fb6ff" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Faint star field. */}
            <g fill="#fff">
              {Array.from({length: 70}, (_, i) => (
                <circle key={i} cx={(i * 173) % 1200} cy={(i * 97) % 600} r={i % 7 === 0 ? 1.4 : 0.7} opacity={0.15 + ((i * 37) % 50) / 100} />
              ))}
            </g>

            <circle cx={EARTH.cx} cy={EARTH.cy} r={EARTH.r * 1.18} fill="url(#earth-glow)" />
            <image
              href="/layers/m/earth.webp"
              x={EARTH.cx - LAYER.cx * earthW}
              y={EARTH.cy - LAYER.cy * earthH}
              width={earthW}
              height={earthH}
              clipPath="url(#earth-clip)"
              preserveAspectRatio="none"
            />
            <circle cx={MOON.cx} cy={MOON.cy} r={MOON.r} fill="url(#moon-shade)" />
            <g fill="#5d626c" opacity="0.6">
              <circle cx={MOON.cx - 14} cy={MOON.cy - 10} r="7" />
              <circle cx={MOON.cx + 12} cy={MOON.cy + 14} r="5" />
              <circle cx={MOON.cx + 18} cy={MOON.cy - 18} r="3.5" />
            </g>

            {/* Ghost of the full route, then the inked legs over it. */}
            {LEGS.map((d, i) => (
              <path key={`g${i}`} d={d} fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="1.5" strokeDasharray="3 6" />
            ))}
            {LEGS.map((d, i) => (
              <path
                key={i}
                ref={(el) => {
                  if (el) legRefs.current[i] = el;
                }}
                d={d}
                pathLength={1}
                fill="none"
                stroke={i === 1 ? '#6fb6ff' : '#f2e6c9'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="1 1"
                strokeDashoffset="1"
              />
            ))}

            <g ref={capsuleRef} transform={`translate(${EARTH.cx} ${EARTH.cy - 128})`}>
              <circle r="11" fill="#6fb6ff" opacity="0.25" />
              <circle r="4.5" fill="#fff" />
            </g>

            <g fontFamily="IBM Plex Mono, monospace" fontSize="13" letterSpacing="2" fill="#8b909b">
              <text x={EARTH.cx} y={EARTH.cy + EARTH.r + 58} textAnchor="middle">
                QUESTION
              </text>
              <text x={MOON.cx} y={MOON.cy + MOON.r + 70} textAnchor="middle">
                ANSWER
              </text>
            </g>
          </svg>
        </div>

        {/* Current leg. */}
        <div className="sl-leg">
          <p className="sl-eyebrow">
            {current.day} · Leg {leg + 1}/{trajectory.legs.length}
          </p>
          <div key={leg} className="sl-leg-in" aria-live="polite">
            <h3>{current.title}</h3>
            <p>{current.body}</p>
          </div>
          <div className="sl-pips" aria-hidden="true">
            {trajectory.legs.map((_, i) => (
              <span key={i} className={i <= leg ? 'on' : ''} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
