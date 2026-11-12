"use client";

import { useEffect, useRef } from "react";
import { intro, log } from "./content";
import { clamp, pinProgress, range } from "@/lib/math";
import { onFrame } from "@/lib/scroll";

/**
 * The pipeline as a reel of stills. The section pins and the reel slides
 * sideways with the scroll; the frame nearest the focus line is lit, the rest
 * dim back, and each picture drifts against its frame.
 */
const SECTION_VH = 340;

export function MissionLog() {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const cardRefs = useRef<HTMLLIElement[]>([]);
  const imgRefs = useRef<HTMLImageElement[]>([]);
  const barRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let lastP = -1;
    return onFrame(() => {
      const root = rootRef.current;
      const track = trackRef.current;
      if (!root || !track) return;
      const { p, rect, vh } = pinProgress(root);
      if (rect.bottom < 0 || rect.top > vh) return;
      if (Math.abs(p - lastP) < 0.00005) return;
      lastP = p;

      const vw = window.innerWidth;
      const k = range(p, 0.04, 0.96);
      const travel = Math.max(0, track.offsetLeft + track.scrollWidth - vw * 0.94);
      track.style.transform = `translate3d(${-k * travel}px, 0, 0)`;

      let nearest = 0;
      let best = Infinity;
      cardRefs.current.forEach((card, i) => {
        const r = card.getBoundingClientRect();
        const off = (r.left + r.width / 2 - vw * 0.62) / vw;
        const a = clamp(Math.abs(off) * 1.6);
        card.style.opacity = String(1 - a * 0.55);
        card.style.transform = `scale(${1 - a * 0.07})`;
        imgRefs.current[i].style.transform = `translate3d(${off * -60}px, 0, 0) scale(1.15)`;
        if (Math.abs(off) < best) {
          best = Math.abs(off);
          nearest = i;
        }
      });
      barRef.current!.style.transform = `scaleX(${k})`;
      countRef.current!.textContent = `0${nearest + 1}`;
    });
  }, []);

  return (
    <section ref={rootRef} id="log" aria-labelledby="log-title" className="sl-section sl-log" style={{ height: `${SECTION_VH}svh` }}>
      <div className="sl-sticky sl-log-sticky">
        <div className="sl-log-intro">
          <p className="sl-eyebrow">{intro.eyebrow}</p>
          <h2 id="log-title" className="sl-h2">
            {intro.heading}
          </h2>
          <p className="sl-body sl-hide-m">{intro.body}</p>
          <div className="sl-counter sl-hide-m" aria-hidden="true">
            <span>
              <span ref={countRef} className="now">
                01
              </span>{" "}
              / 0{log.length}
            </span>
            <span className="bar">
              <span ref={barRef} style={{ transform: "scaleX(0)" }} />
            </span>
          </div>
        </div>

        <ol ref={trackRef} className="sl-track">
          {log.map((entry, i) => (
            <li
              key={entry.title}
              ref={(el) => {
                if (el) cardRefs.current[i] = el;
              }}
              className="sl-card"
            >
              <figure>
                <div className="sl-card-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={(el) => {
                      if (el) imgRefs.current[i] = el;
                    }}
                    src={entry.image}
                    alt={`${entry.title}: ${entry.body}`}
                    width={840}
                    height={1120}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="sl-tag">{entry.tag}</span>
                </div>
                <figcaption>
                  <span className="n">0{i + 1}</span>
                  <span>
                    <span className="t">{entry.title}</span>
                    <span className="d">{entry.body}</span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
