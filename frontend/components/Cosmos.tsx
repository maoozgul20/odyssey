"use client";

// The space behind every page, drawn in code: nebula clouds (CSS gradients), twinkling
// stars and the odd shooting star (canvas). It sits behind everything and ignores clicks.

import { useEffect, useRef } from "react";

export function Cosmos() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0;
    type Star = { x: number; y: number; r: number; a: number; s: number; hue: number };
    let stars: Star[] = [];
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 2600);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.92 ? Math.random() * 0.9 + 0.2 : Math.random() * 1.4 + 0.9,
        a: Math.random() * Math.PI * 2,
        s: 0.4 + Math.random() * 1.6,
        hue: [210, 230, 260, 190, 40][Math.floor(Math.random() * 5)],
      }));
    };
    resize();
    window.addEventListener("resize", resize);
    let t0 = performance.now();
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(s.a + t * s.s);
        ctx.globalAlpha = tw;
        ctx.fillStyle = `hsl(${s.hue} 90% ${s.hue === 40 ? 80 : 88}%)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.2) {
          ctx.globalAlpha = tw * 0.35;
          ctx.fillRect(s.x - s.r * 3, s.y - 0.3, s.r * 6, 0.6);
          ctx.fillRect(s.x - 0.3, s.y - s.r * 3, 0.6, s.r * 6);
        }
      }
      ctx.globalAlpha = 1;
      if (!still) {
        if (!shoot && Math.random() < 0.004) shoot = { x: Math.random() * w * 0.8 + w * 0.2, y: Math.random() * h * 0.4, vx: -9, vy: 4, life: 1 };
        if (shoot) {
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14);
          g.addColorStop(0, `rgba(200,230,255,${shoot.life})`);
          g.addColorStop(1, "rgba(200,230,255,0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(shoot.x, shoot.y);
          ctx.lineTo(shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14);
          ctx.stroke();
          shoot.x += shoot.vx;
          shoot.y += shoot.vy;
          shoot.life -= 0.012;
          if (shoot.life <= 0) shoot = null;
        }
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <div className="cosmos" aria-hidden="true">
      <div className="nebula n1" />
      <div className="nebula n2" />
      <div className="nebula n3" />
      <canvas ref={ref} />
    </div>
  );
}
