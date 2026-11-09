"use client";

// Every known exoplanet, placed at its real direction in the sky (RA/Dec) and its real
// distance (log scale, so both Proxima b at 4 light years and planets 20,000 light years
// away fit on screen). The Sun sits at the centre.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type GRow = [string, string, number, number, number, number | null, number | null, boolean | null, number | null, string | null, string | null, number | null];
// name, host, ra, dec, dist_pc, radius, eq_temp, in_hz, esi, size_class, disc_method, disc_year
export type ColorBy = "habitable" | "size" | "temperature" | "method";

const SIZE_COL: Record<string, string> = { "Earth-size": "#8dffb0", "Super-Earth": "#6fd3ff", "Sub-Neptune": "#b78cff", "Neptune-like": "#5f7cff", "Gas giant": "#ffb648" };
const METHOD_COL: Record<string, string> = { Transit: "#6fd3ff", "Radial Velocity": "#ffb648", Microlensing: "#b78cff", Imaging: "#ff7a9a", "Transit Timing Variations": "#8dffb0" };

export function colorFor(r: GRow, by: ColorBy): THREE.Color {
  if (by === "habitable") return new THREE.Color(r[7] ? "#8dffb0" : r[8] && r[8] > 0.5 ? "#4f8a6b" : "#3d5a80");
  if (by === "size") return new THREE.Color(SIZE_COL[r[9] ?? ""] ?? "#55606e");
  if (by === "method") return new THREE.Color(METHOD_COL[r[10] ?? ""] ?? "#8b9aab");
  const t = r[6];
  if (t == null) return new THREE.Color("#55606e");
  const x = Math.min(1, Math.max(0, (Math.log10(t) - 2) / 1.5)); // 100 K .. 3000 K
  return new THREE.Color().setHSL(0.62 - 0.62 * x, 0.85, 0.6);
}

export function position(r: GRow): THREE.Vector3 {
  const ra = (r[2] * Math.PI) / 180;
  const dec = (r[3] * Math.PI) / 180;
  const ly = r[4] * 3.26156;
  const d = Math.log10(1 + ly) * 40; // 10 ly -> 42, 1,000 ly -> 120, 10,000 ly -> 160
  return new THREE.Vector3(d * Math.cos(dec) * Math.cos(ra), d * Math.sin(dec), -d * Math.cos(dec) * Math.sin(ra));
}

const VERT = `
attribute float size;
attribute vec3 color;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * (0.6 + a), a);
}`;

export function Galaxy3D({
  rows,
  colorBy,
  highlight,
  selected,
  onPick,
}: {
  rows: GRow[];
  colorBy: ColorBy;
  highlight: string[];
  selected: string | null;
  onPick: (name: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setColors: (by: ColorBy) => void;
    setHighlight: (names: string[], sel: string | null) => void;
    focus: (name: string) => void;
  } | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const el = mount.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 4000);
    camera.position.set(140, 90, 180);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    controls.minDistance = 8;
    controls.maxDistance = 600;

    // distance rings: 10, 100, 1,000 and 10,000 light years
    for (const ly of [10, 100, 1000, 10000]) {
      const r = Math.log10(1 + ly) * 40;
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => new THREE.Vector3(r * Math.cos((i / 128) * Math.PI * 2), 0, r * Math.sin((i / 128) * Math.PI * 2)))),
        new THREE.LineBasicMaterial({ color: 0x2b3848, transparent: true, opacity: 0.7 }),
      );
      scene.add(ring);
    }
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    scene.add(sun);

    // background stars
    const bg = new THREE.BufferGeometry();
    const bgPos = new Float32Array(3000 * 3);
    for (let i = 0; i < bgPos.length; i++) bgPos[i] = (Math.random() - 0.5) * 3000;
    bg.setAttribute("position", new THREE.BufferAttribute(bgPos, 3));
    scene.add(new THREE.Points(bg, new THREE.PointsMaterial({ color: 0x8b9aab, size: 1, sizeAttenuation: false, transparent: true, opacity: 0.5 })));

    // the planets
    const n = rows.length;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const pts: THREE.Vector3[] = [];
    rows.forEach((r, i) => {
      const p = position(r);
      pts.push(p);
      pos.set([p.x, p.y, p.z], i * 3);
      size[i] = 1.6 + Math.min(3, Math.log2(1 + (r[5] ?? 2)));
    });
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const cloud = new THREE.Points(geo, mat);
    scene.add(cloud);

    const index = new Map(rows.map((r, i) => [r[0], i]));
    const hlGroup = new THREE.Group();
    scene.add(hlGroup);
    let hlNames: string[] = [];
    let target: THREE.Vector3 | null = null;

    const setColors = (by: ColorBy) => {
      rows.forEach((r, i) => {
        const c = colorFor(r, by);
        col.set([c.r, c.g, c.b], i * 3);
      });
      geo.attributes.color.needsUpdate = true;
    };
    const ringTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      g.strokeStyle = "#fff";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(32, 32, 26, 0, Math.PI * 2);
      g.stroke();
      return new THREE.CanvasTexture(c);
    })();
    const setHighlight = (names: string[], sel: string | null) => {
      hlGroup.clear();
      hlNames = names.filter((x) => index.has(x)).slice(0, 25);
      for (const name of hlNames) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: name === sel ? 0xffb648 : 0x8dffb0, depthTest: false, transparent: true, sizeAttenuation: false }));
        s.position.copy(pts[index.get(name)!]);
        s.scale.setScalar(name === sel ? 0.05 : 0.035);
        hlGroup.add(s);
      }
      if (sel && index.has(sel) && !hlNames.includes(sel)) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xffb648, depthTest: false, transparent: true, sizeAttenuation: false }));
        s.position.copy(pts[index.get(sel)!]);
        s.scale.setScalar(0.05);
        hlGroup.add(s);
        hlNames = [...hlNames, sel];
      }
    };
    const focus = (name: string) => {
      const i = index.get(name);
      if (i === undefined) return;
      target = pts[i].clone();
      controls.autoRotate = false;
    };
    api.current = { setColors, setHighlight, focus };

    // picking
    const ray = new THREE.Raycaster();
    ray.params.Points = { threshold: 1.5 };
    const mouse = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // that was a drag
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObject(cloud)[0];
      if (hit?.index !== undefined) pickRef.current(rows[hit.index][0]);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    let raf = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      if (target) {
        controls.target.lerp(target, 0.08);
        const want = target.clone().add(new THREE.Vector3(18, 10, 22));
        camera.position.lerp(want, 0.05);
        if (controls.target.distanceTo(target) < 0.2) target = null;
      }
      controls.update();
      renderer.render(scene, camera);
      // HTML labels for highlighted planets
      const box = labels.current;
      if (box) {
        const kids = box.children;
        hlNames.forEach((name, k) => {
          let lab = kids[k] as HTMLElement | undefined;
          if (!lab) {
            lab = document.createElement("span");
            box.appendChild(lab);
          }
          v.copy(pts[index.get(name)!]).project(camera);
          const visible = v.z < 1;
          lab.textContent = name;
          lab.style.display = visible ? "block" : "none";
          lab.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth + 8}px, ${((1 - v.y) / 2) * el.clientHeight - 8}px)`;
        });
        for (let k = kids.length - 1; k >= hlNames.length; k--) kids[k].remove();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, [rows]);

  useEffect(() => api.current?.setColors(colorBy), [colorBy, rows]);
  useEffect(() => api.current?.setHighlight(highlight, selected), [highlight, selected, rows]);
  useEffect(() => {
    if (selected) api.current?.focus(selected);
  }, [selected]);

  return (
    <div className="galaxy" ref={mount}>
      <div className="galaxy-labels" ref={labels} aria-hidden="true" />
    </div>
  );
}
