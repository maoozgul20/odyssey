import Link from "next/link";
import { Orbit } from "lucide-react";

export const STATIONS = [
  { href: "/mission-control", n: 1, name: "Mission Control" },
  { href: "/mars", n: 2, name: "Mars" },
  { href: "/starship", n: 3, name: "Starship" },
  { href: "/planet-lab", n: 4, name: "Planet Lab" },
  { href: "/knowledge-map", n: 5, name: "Knowledge Map" },
  { href: "/eval", n: 6, name: "Evaluation" },
];

export function StationNav({ current }: { current: string }) {
  return (
    <nav aria-label="Stations" className="mission-nav">
      {STATIONS.map((s) => (
        <Link key={s.href} href={s.href} className={s.href === current ? "selected" : ""} aria-current={s.href === current ? "page" : undefined}>
          {String(s.n).padStart(2, "0")} {s.name}
        </Link>
      ))}
    </nav>
  );
}

export function Brand({ current }: { current: string }) {
  return (
    <div className="mission-brand brand">
      <Link href="/" className="back-orbit" aria-label="Back to stations">
        <Orbit size={20} />
      </Link>
      <div>
        <Link href="/" className="brand-word">
          ODYSSEY
        </Link>
        <StationNav current={current} />
      </div>
    </div>
  );
}
