"use client";

import Link from "next/link";
import { stations } from "./content";
import { useReveals } from "@/hooks/useReveals";

/** Six station cards. Each carries its number as a set of orbit rings. */
export function Stations() {
  const ref = useReveals<HTMLElement>();
  return (
    <section ref={ref} id="stations" aria-labelledby="stations-title" className="sl-section sl-stations">
      <div className="sl-stations-head" data-reveal>
        <div>
          <p className="sl-eyebrow">{stations.eyebrow}</p>
          <h2 id="stations-title" className="sl-h2">
            {stations.heading}
          </h2>
        </div>
        <p className="sl-note">{stations.note}</p>
      </div>

      <ol className="sl-grid">
        {stations.items.map((s, i) => (
          <li key={s.name} data-reveal style={{ transitionDelay: `${(i % 3) * 110}ms` }} className={`sl-station ${s.featured ? "featured" : ""}`}>
            <svg aria-hidden="true" viewBox="0 0 200 200" className="sl-rings">
              {Array.from({ length: s.n }, (_, k) => (
                <ellipse key={k} cx="100" cy="100" rx={40 + k * 14} ry={18 + k * 6} fill="none" stroke="currentColor" transform={`rotate(${-20 + k * 14} 100 100)`} />
              ))}
              <circle cx="100" cy="100" r="9" fill="currentColor" />
            </svg>
            {s.featured && <span className="sl-flag">Start here</span>}
            <h3 className={s.featured ? "after-flag" : ""}>{s.name}</h3>
            <p className="sl-num">
              <span>{String(s.n).padStart(2, "0")}</span>
              <small>/ 06 · {s.rag}</small>
            </p>
            <ul>
              {s.lines.map((l) => (
                <li key={l}>
                  <span aria-hidden="true" />
                  {l}
                </li>
              ))}
            </ul>
            <Link href={s.href} className={`sl-btn ${s.featured ? "sl-btn-earth" : "sl-btn-ghost"}`}>
              {s.cta}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
