"use client";

import Link from "next/link";
import { launch } from "./content";
import { useReveals } from "@/hooks/useReveals";

/** Final call to action: the numbers the system is measured by, and the way in. */
export function Launch({ online }: { online: boolean | null }) {
  const ref = useReveals<HTMLElement>();
  return (
    <section ref={ref} id="launch" aria-labelledby="launch-title" className="sl-section sl-launch">
      <div aria-hidden="true" className="sl-horizon" />
      <div className="sl-launch-grid">
        <div data-reveal>
          <p className="sl-eyebrow">{launch.eyebrow}</p>
          <h2 id="launch-title" className="sl-h2">
            {launch.heading}
          </h2>
          <p className="sl-body">{launch.body}</p>
          <div className="sl-tiles" role="list" aria-label="Measured results">
            {launch.stats.map((s) => (
              <div key={s.label} role="listitem" className="brackets sl-tile">
                <span className="v">{s.value}</span>
                <span className="l">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sl-actions" data-reveal>
          <p className={`sl-backend ${online === false ? "down" : ""}`} role="status">
            <i />
            {online === null ? "Checking the backend…" : online ? "Backend online. All systems go." : "Backend offline. Start it with: uvicorn app.main:app --port 8000"}
          </p>
          <Link href="/mission-control" className="sl-btn sl-btn-white big">
            Enter Mission Control
          </Link>
          <Link href="/eval" className="sl-btn sl-btn-ghost big">
            See the evaluation
          </Link>
          <a href={launch.repo} target="_blank" rel="noreferrer" className="sl-btn sl-btn-ghost big">
            View the code on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
