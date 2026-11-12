"use client";

import { useEffect, useRef } from "react";

/** Quiet backdrop for the stations: the Selene sky, dimmed, with drifting dust. */
export function SeleneBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const motes = Array.from({ length: 90 }, () => ({ x: rand(), y: rand(), r: 0.4 + rand() * 1.3, s: 0.3 + rand(), a: 0.15 + rand() * 0.45 }));
    const sync = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
    };
    sync();
    window.addEventListener("resize", sync);
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60;
      last = t;
      const w = c.clientWidth;
      const h = c.clientHeight;
      const dpr = c.width / Math.max(1, w);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#dfe6f2";
      for (const m of motes) {
        if (!reduce) {
          m.x += 0.006 * m.s * dt;
          m.y -= 0.004 * m.s * dt;
          if (m.x > 1) m.x -= 1;
          if (m.y < 0) m.y += 1;
        }
        ctx.globalAlpha = m.a;
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return (
    <div className="sl-backdrop" aria-hidden="true">
      <div className="sl-backdrop-sky" />
      <canvas ref={ref} />
    </div>
  );
}
