"use client";

// A living space backdrop, drawn in code on a canvas over the deep-space photo:
//  - three depth layers of twinkling stars in real star colours (with glints on the bright ones)
//  - the photo (with its ringed planet) drifts slowly and follows the mouse in parallax;
//    on the home page it can also be grabbed and dragged, then springs back
//  - shooting stars, satellites with blinking beacons, a comet with a glowing tail,
//    a tumbling rock-like asteroid and drifting space dust
// "ambient" is a calmer version for the station pages (no photo layer, fewer objects).

import { useEffect, useRef } from "react";

type Star = { x: number; y: number; r: number; layer: number; tw: number; sp: number; col: string };
type Meteor = { x: number; y: number; vx: number; vy: number; len: number; life: number; max: number };
type Sat = { x: number; y: number; vx: number; vy: number; blink: number };
type Comet = { x: number; y: number; vx: number; vy: number };
type Rock = { x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; pts: number[] };
type Dust = { x: number; y: number; r: number; vx: number; vy: number; o: number };

// star colours by temperature: blue-white, white, yellow-white, yellow, orange, red
const COLORS = ["#a9c8ff", "#cfe0ff", "#ffffff", "#fff4e0", "#ffe2b0", "#ffc68a", "#ff9e7a"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function SpaceScene({ variant = "hero" }: { variant?: "hero" | "ambient" }) {
  const wrap = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = wrap.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const hero = variant === "hero";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1;
    let stars: Star[] = [];
    const meteors: Meteor[] = [];
    const sats: Sat[] = [];
    let comet: Comet | null = null;
    let rock: Rock | null = null;
    let dust: Dust[] = [];

    // pointer parallax (-1..1) and drag offset, both eased
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const drag = { on: false, sx: 0, sy: 0, dx: 0, dy: 0, ox: 0, oy: 0 };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = host.clientWidth;
      h = host.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / (hero ? 1700 : 3200));
      stars = Array.from({ length: n }, () => {
        const layer = Math.random() < 0.65 ? 0 : Math.random() < 0.75 ? 1 : 2;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: layer === 0 ? rnd(0.25, 0.7) : layer === 1 ? rnd(0.6, 1.1) : rnd(1.1, 1.9),
          layer,
          tw: Math.random() * Math.PI * 2,
          sp: rnd(0.6, 2.4),
          col: pick(COLORS),
        };
      });
      dust = Array.from({ length: hero ? 26 : 10 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rnd(0.6, 2.2),
        vx: rnd(-0.08, 0.08),
        vy: rnd(-0.05, 0.03),
        o: rnd(0.05, 0.18),
      }));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (drag.on) {
        drag.dx = drag.ox + (e.clientX - drag.sx);
        drag.dy = drag.oy + (e.clientY - drag.sy);
      }
    };
    // drag the sky (home page only), but never steal clicks from links and buttons
    const area = host.parentElement!;
    const onDown = (e: PointerEvent) => {
      if (!hero || (e.target as HTMLElement).closest("a,button,input,textarea,select")) return;
      drag.on = true;
      drag.sx = e.clientX;
      drag.sy = e.clientY;
      drag.ox = drag.dx;
      drag.oy = drag.dy;
      area.classList.add("grabbing");
    };
    const onUp = () => {
      drag.on = false;
      area.classList.remove("grabbing");
    };
    window.addEventListener("pointermove", onMove);
    area.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    const spawnMeteor = () => {
      const angle = rnd(0.35, 0.65); // heading down-left
      const speed = rnd(9, 15);
      meteors.push({ x: rnd(w * 0.25, w * 1.1), y: rnd(-40, h * 0.35), vx: -Math.cos(angle) * speed, vy: Math.sin(angle) * speed, len: rnd(110, 240), life: 0, max: rnd(45, 75) });
    };
    const spawnSat = () => {
      const left = Math.random() < 0.5;
      sats.push({ x: left ? -10 : w + 10, y: rnd(h * 0.08, h * 0.6), vx: (left ? 1 : -1) * rnd(0.25, 0.5), vy: rnd(-0.08, 0.08), blink: Math.random() * 100 });
    };
    const spawnComet = () => {
      comet = { x: w + 60, y: rnd(h * 0.05, h * 0.3), vx: -rnd(0.35, 0.55), vy: rnd(0.08, 0.16) };
    };
    const spawnRock = () => {
      const pts = Array.from({ length: 11 }, () => rnd(0.72, 1.12));
      rock = { x: -60, y: rnd(h * 0.55, h * 0.85), vx: rnd(0.22, 0.4), vy: rnd(-0.06, 0.02), r: rnd(9, 16), a: 0, va: rnd(-0.006, 0.006), pts };
    };
    if (hero) {
      spawnSat();
      spawnRock();
    }
    let lastMeteor = 0, lastSat = performance.now(), lastComet = performance.now() - 20000, lastRock = performance.now();

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // ease parallax and spring the drag back home when released
      cur.x += (target.x - cur.x) * 0.04;
      cur.y += (target.y - cur.y) * 0.04;
      if (!drag.on) {
        drag.dx *= 0.94;
        drag.dy *= 0.94;
      }
      const px = cur.x * 18 + drag.dx * 0.6;
      const py = cur.y * 12 + drag.dy * 0.6;

      // the photo layer: slow drift + parallax (moves least: it is the farthest)
      if (photo.current) {
        const driftX = Math.sin(t * 0.05) * 14;
        const driftY = Math.cos(t * 0.04) * 8;
        const s = 1.08 + Math.sin(t * 0.03) * 0.025;
        photo.current.style.transform = `translate3d(${(-px * 0.6 + driftX).toFixed(2)}px, ${(-py * 0.6 + driftY).toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
      }

      ctx.clearRect(0, 0, w, h);

      // stars
      for (const s of stars) {
        const depth = [0.25, 0.6, 1.2][s.layer];
        let x = s.x - px * depth;
        let y = s.y - py * depth;
        x = ((x % w) + w) % w;
        y = ((y % h) + h) % h;
        const tw = still ? 0.85 : 0.5 + 0.5 * Math.sin(s.tw + t * s.sp);
        ctx.globalAlpha = (s.layer === 0 ? 0.55 : 0.8) * (0.35 + 0.65 * tw);
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.layer === 2) {
          // soft halo and a diffraction glint, like a real telescope image
          const g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 5);
          g.addColorStop(0, s.col);
          g.addColorStop(1, "transparent");
          ctx.globalAlpha = 0.18 * tw;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, s.r * 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.35 * tw;
          ctx.fillRect(x - s.r * 5, y - 0.35, s.r * 10, 0.7);
          ctx.fillRect(x - 0.35, y - s.r * 5, 0.7, s.r * 10);
        }
      }
      ctx.globalAlpha = 1;

      if (!still) {
        // space dust, close to the "camera"
        for (const d of dust) {
          d.x = (d.x + d.vx + w) % w;
          d.y = (d.y + d.vy + h) % h;
          ctx.globalAlpha = d.o;
          ctx.fillStyle = "#cfe8ff";
          ctx.beginPath();
          ctx.arc(d.x - px * 1.8, d.y - py * 1.8, d.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // comet: slow, with a long soft tail pointing away from the light
        if (hero && !comet && now - lastComet > 45000) {
          spawnComet();
          lastComet = now;
        }
        if (comet) {
          const c = comet;
          c.x += c.vx;
          c.y += c.vy;
          const cx = c.x - px * 0.4, cy = c.y - py * 0.4;
          const tx = cx - c.vx * 420, ty = cy - c.vy * 420;
          const tail = ctx.createLinearGradient(cx, cy, tx, ty);
          tail.addColorStop(0, "rgba(180,230,255,0.55)");
          tail.addColorStop(0.3, "rgba(120,200,255,0.18)");
          tail.addColorStop(1, "rgba(120,200,255,0)");
          ctx.strokeStyle = tail;
          ctx.lineCap = "round";
          for (const [wd, off] of [[6, 0], [2.5, 6], [2, -5]]) {
            ctx.lineWidth = wd;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.quadraticCurveTo((cx + tx) / 2, (cy + ty) / 2 + off * 4, tx, ty + off * 6);
            ctx.stroke();
          }
          const head = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10);
          head.addColorStop(0, "rgba(255,255,255,1)");
          head.addColorStop(0.3, "rgba(190,235,255,0.8)");
          head.addColorStop(1, "rgba(150,210,255,0)");
          ctx.fillStyle = head;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fill();
          if (c.x < -500 || c.y > h + 200) comet = null;
        }

        // asteroid: a lumpy, lit rock tumbling slowly across the lower sky
        if (hero && !rock && now - lastRock > 30000) {
          spawnRock();
          lastRock = now;
        }
        if (rock) {
          const r = rock;
          r.x += r.vx;
          r.y += r.vy;
          r.a += r.va;
          const rx = r.x - px * 1.4, ry = r.y - py * 1.4;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(r.a);
          ctx.beginPath();
          r.pts.forEach((k, i) => {
            const a = (i / r.pts.length) * Math.PI * 2;
            const fx = Math.cos(a) * r.r * k, fy = Math.sin(a) * r.r * k;
            if (i === 0) ctx.moveTo(fx, fy);
            else ctx.lineTo(fx, fy);
          });
          ctx.closePath();
          const lit = ctx.createRadialGradient(-r.r * 0.5, -r.r * 0.5, 1, 0, 0, r.r * 1.2);
          lit.addColorStop(0, "#9d958c");
          lit.addColorStop(0.55, "#4d4741");
          lit.addColorStop(1, "#141210");
          ctx.fillStyle = lit;
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          for (const [cx2, cy2, cr] of [[0.2, 0.1, 0.22], [-0.35, 0.3, 0.14], [0.35, -0.35, 0.12]]) {
            ctx.beginPath();
            ctx.arc(cx2 * r.r, cy2 * r.r, cr * r.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          if (r.x > w + 80) rock = null;
        }

        // satellites: a steady point of light with a blinking beacon
        if (now - lastSat > (hero ? 14000 : 26000) && sats.length < 2) {
          spawnSat();
          lastSat = now;
        }
        for (let i = sats.length - 1; i >= 0; i--) {
          const s = sats[i];
          s.x += s.vx;
          s.y += s.vy;
          s.blink += 1;
          const sx = s.x - px * 0.9, sy = s.y - py * 0.9;
          ctx.fillStyle = "rgba(235,240,255,0.9)";
          ctx.fillRect(sx - 1, sy - 1, 2, 2);
          ctx.fillStyle = "rgba(160,190,255,0.5)";
          ctx.fillRect(sx - 5, sy - 0.5, 3, 1);
          ctx.fillRect(sx + 2, sy - 0.5, 3, 1);
          if (s.blink % 70 < 8) {
            const b = ctx.createRadialGradient(sx, sy, 0, sx, sy, 5);
            b.addColorStop(0, "rgba(255,80,90,1)");
            b.addColorStop(1, "rgba(255,80,90,0)");
            ctx.fillStyle = b;
            ctx.beginPath();
            ctx.arc(sx, sy, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          if (s.x < -40 || s.x > w + 40) sats.splice(i, 1);
        }

        // shooting stars
        if (now - lastMeteor > (hero ? rnd(2200, 5000) : rnd(7000, 14000))) {
          spawnMeteor();
          lastMeteor = now;
        }
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.x += m.vx;
          m.y += m.vy;
          m.life += 1;
          const fade = Math.sin((m.life / m.max) * Math.PI);
          const sp = Math.hypot(m.vx, m.vy);
          const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
          const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
          g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
          g.addColorStop(0.15, `rgba(180,225,255,${0.6 * fade})`);
          g.addColorStop(1, "rgba(120,180,255,0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          const head = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 4);
          head.addColorStop(0, `rgba(255,255,255,${fade})`);
          head.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = head;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
          ctx.fill();
          if (m.life >= m.max) meteors.splice(i, 1);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [variant]);

  return (
    <div className={`space-scene ${variant}`} ref={wrap} aria-hidden="true">
      {variant === "hero" && <div className="space-photo" ref={photo} />}
      {variant === "hero" && <div className="space-shade" />}
      <canvas ref={canvas} />
    </div>
  );
}
