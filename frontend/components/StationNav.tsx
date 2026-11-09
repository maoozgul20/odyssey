import Link from "next/link";
import { Logo } from "@/components/Art";

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
    <nav aria-label="Stations" className="stations">
      {STATIONS.map((s) => (
        <Link key={s.href} href={s.href} className={`st ${s.href === current ? "on" : ""}`} aria-current={s.href === current ? "page" : undefined}>
          {s.n} {s.name}
        </Link>
      ))}
    </nav>
  );
}

export function Brand({ current }: { current: string }) {
  return (
    <div className="brand">
      <Link href="/" className="logo-link" aria-label="ODYSSEY home">
        <Logo />
      </Link>
      <div>
        <strong>ODYSSEY</strong>
        <StationNav current={current} />
      </div>
    </div>
  );
}
