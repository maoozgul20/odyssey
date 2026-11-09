// Illustrations drawn entirely in SVG: an astronaut, the Earth, a satellite, the logo.

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="logo-svg">
      <defs>
        <linearGradient id="lg-ring" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#5ee7ff" />
          <stop offset="1" stopColor="#a66bff" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="11" fill="none" stroke="url(#lg-ring)" strokeWidth="2.6" />
      <ellipse cx="20" cy="20" rx="18" ry="7" fill="none" stroke="url(#lg-ring)" strokeWidth="1.6" transform="rotate(-28 20 20)" opacity="0.9" />
      <circle cx="34.5" cy="11.5" r="2.6" fill="#ffc04d" />
    </svg>
  );
}

export function Earth({ size = 300, className = "" }: { size?: number; className?: string }) {
  // continents slide sideways inside a circular clip, so the planet seems to turn
  const land = (
    <g fill="url(#e-land)">
      <path d="M40 70c18-14 40-10 52 4s4 30-10 36-12 22-28 22-30-18-26-32 0-22 12-30z" />
      <path d="M120 40c22-6 46 6 50 22s-10 26-24 26-12 18-28 14-14-26-10-38 2-20 12-24z" />
      <path d="M150 120c16-4 30 8 30 22s-14 30-28 26-20-14-18-26 4-20 16-22z" />
      <path d="M70 150c10-6 26-2 30 10s-6 24-18 22-22-8-20-18 0-10 8-14z" />
      <path d="M205 70c14-8 30 0 32 14s-10 22-22 20-20-8-18-18 0-12 8-16z" />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" className={`earth ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id="e-ocean" cx="38%" cy="35%" r="70%">
          <stop offset="0" stopColor="#5fc8ff" />
          <stop offset="0.45" stopColor="#1f6fd1" />
          <stop offset="1" stopColor="#0a2463" />
        </radialGradient>
        <linearGradient id="e-land" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#7bd389" />
          <stop offset="0.6" stopColor="#3f9b5a" />
          <stop offset="1" stopColor="#a9885a" />
        </linearGradient>
        <radialGradient id="e-shade" cx="30%" cy="28%" r="80%">
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#020617" stopOpacity="0.85" />
        </radialGradient>
        <radialGradient id="e-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0.86" stopColor="#5ee7ff" stopOpacity="0" />
          <stop offset="0.93" stopColor="#5ee7ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#5ee7ff" stopOpacity="0" />
        </radialGradient>
        <filter id="e-blur">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <clipPath id="e-clip">
          <circle cx="100" cy="100" r="86" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#e-glow)" />
      <circle cx="100" cy="100" r="86" fill="url(#e-ocean)" />
      <g clipPath="url(#e-clip)">
        <g className="earth-spin">
          {land}
          <g transform="translate(240 0)">{land}</g>
        </g>
        <g className="earth-clouds" fill="#fff" opacity="0.7" filter="url(#e-blur)">
          <ellipse cx="60" cy="60" rx="30" ry="5" />
          <ellipse cx="130" cy="95" rx="38" ry="6" />
          <ellipse cx="80" cy="140" rx="34" ry="5" />
          <ellipse cx="160" cy="150" rx="22" ry="4" />
          <ellipse cx="300" cy="80" rx="36" ry="5" />
          <ellipse cx="270" cy="130" rx="30" ry="5" />
        </g>
        <circle cx="100" cy="100" r="86" fill="url(#e-shade)" />
      </g>
    </svg>
  );
}

export function Moon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="moon" aria-hidden="true">
      <defs>
        <radialGradient id="m-g" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#f4f1ea" />
          <stop offset="0.6" stopColor="#a9a6b8" />
          <stop offset="1" stopColor="#3b3a52" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#m-g)" />
      <circle cx="14" cy="15" r="3" fill="#8f8ca3" opacity="0.6" />
      <circle cx="25" cy="25" r="4" fill="#8f8ca3" opacity="0.5" />
      <circle cx="26" cy="12" r="1.8" fill="#8f8ca3" opacity="0.6" />
    </svg>
  );
}

export function Satellite({ size = 220 }: { size?: number }) {
  const panel = (x: number) => (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="22" width="78" height="36" rx="2" fill="url(#s-panel)" stroke="#8fb2ff" strokeWidth="0.8" />
      {[13, 26, 39, 52, 65].map((v) => (
        <line key={v} x1={v} x2={v} y1="22" y2="58" stroke="#8fb2ff" strokeOpacity="0.45" strokeWidth="0.6" />
      ))}
      <line x1="0" x2="78" y1="40" y2="40" stroke="#8fb2ff" strokeOpacity="0.45" strokeWidth="0.6" />
    </g>
  );
  return (
    <svg width={size} height={(size * 80) / 220} viewBox="0 0 220 80" className="satellite" aria-hidden="true">
      <defs>
        <linearGradient id="s-panel" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#3a5bd9" />
          <stop offset="0.5" stopColor="#1b2a7a" />
          <stop offset="1" stopColor="#5a7dff" />
        </linearGradient>
        <linearGradient id="s-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f2e3b0" />
          <stop offset="1" stopColor="#b08a3c" />
        </linearGradient>
      </defs>
      {panel(0)}
      {panel(142)}
      <line x1="78" x2="96" y1="40" y2="40" stroke="#cfd6ea" strokeWidth="2" />
      <line x1="124" x2="142" y1="40" y2="40" stroke="#cfd6ea" strokeWidth="2" />
      <rect x="94" y="24" width="32" height="32" rx="4" fill="url(#s-body)" />
      <circle cx="110" cy="18" r="7" fill="none" stroke="#cfd6ea" strokeWidth="1.6" />
      <line x1="110" x2="110" y1="24" y2="25" stroke="#cfd6ea" strokeWidth="1.6" />
      <circle cx="104" cy="34" r="1.6" fill="#ff5a6a" className="blink-led" />
    </svg>
  );
}

export function Astronaut({ size = 420 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" className="astronaut" aria-hidden="true">
      <defs>
        <linearGradient id="a-suit" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#dfe5f2" />
          <stop offset="1" stopColor="#8f9bb8" />
        </linearGradient>
        <linearGradient id="a-shadow" x1="0" x2="1">
          <stop offset="0" stopColor="#5a6585" stopOpacity="0" />
          <stop offset="1" stopColor="#3a4466" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id="a-visor" cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="#ffe3a3" />
          <stop offset="0.18" stopColor="#ff9b5c" />
          <stop offset="0.42" stopColor="#7b3fd1" />
          <stop offset="0.75" stopColor="#1a1f6b" />
          <stop offset="1" stopColor="#060a24" />
        </radialGradient>
        <linearGradient id="a-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#f6d27a" />
          <stop offset="1" stopColor="#a8741f" />
        </linearGradient>
        <radialGradient id="a-ref" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7fd3ff" />
          <stop offset="1" stopColor="#1f6fd1" />
        </radialGradient>
      </defs>
      {/* backpack */}
      <rect x="226" y="150" width="120" height="150" rx="26" fill="#c3cbe0" />
      <rect x="236" y="160" width="100" height="130" rx="20" fill="url(#a-shadow)" />
      {/* body */}
      <path d="M128 210c0-40 34-64 82-64s86 24 86 64v92c0 26-20 44-46 44h-76c-28 0-46-18-46-44z" fill="url(#a-suit)" />
      <path d="M260 160c26 10 36 28 36 50v92c0 26-20 44-46 44h-20c30-6 40-30 40-60v-90c0-14-4-28-10-36z" fill="url(#a-shadow)" />
      {/* chest control box */}
      <rect x="170" y="236" width="74" height="48" rx="8" fill="#e9edf6" stroke="#9aa6c2" />
      <circle cx="186" cy="252" r="5" fill="#ff5a6a" />
      <circle cx="202" cy="252" r="5" fill="#5ee7ff" />
      <circle cx="218" cy="252" r="5" fill="#ffc04d" />
      <rect x="182" y="266" width="50" height="8" rx="3" fill="#9aa6c2" />
      {/* mission patch */}
      <circle cx="150" cy="232" r="13" fill="#1a2a7a" stroke="url(#a-gold)" strokeWidth="3" />
      <path d="M143 236l7-12 7 12z" fill="#ffc04d" />
      {/* left arm, raised */}
      <path d="M140 200c-30 4-54 26-62 54-4 16 8 26 20 22 10-4 14-14 18-24 6-14 18-24 34-26z" fill="url(#a-suit)" />
      <circle cx="88" cy="268" r="20" fill="#e9edf6" stroke="#9aa6c2" />
      {/* right arm */}
      <path d="M286 214c22 14 32 38 30 64-1 14-14 20-24 14-8-4-10-14-10-24 0-14-4-28-14-38z" fill="url(#a-suit)" />
      <circle cx="304" cy="294" r="18" fill="#dfe5f2" stroke="#9aa6c2" />
      {/* legs */}
      <path d="M150 330h50l-4 50c-1 10-10 16-22 16s-24-6-24-16z" fill="url(#a-suit)" />
      <path d="M214 330h50v50c0 10-12 16-24 16s-22-6-22-16z" fill="url(#a-suit)" />
      {/* neck ring */}
      <ellipse cx="208" cy="152" rx="66" ry="18" fill="url(#a-gold)" opacity="0.9" />
      {/* helmet */}
      <circle cx="208" cy="100" r="78" fill="url(#a-suit)" />
      <circle cx="208" cy="100" r="78" fill="url(#a-shadow)" />
      <ellipse cx="204" cy="104" rx="58" ry="52" fill="url(#a-gold)" />
      <ellipse cx="204" cy="104" rx="53" ry="47" fill="url(#a-visor)" />
      {/* the Earth reflected in the visor */}
      <circle cx="226" cy="122" r="16" fill="url(#a-ref)" opacity="0.85" />
      <path d="M220 116c4-2 8 0 9 3s-2 6-5 6-6-2-6-5 0-3 2-4z" fill="#7bd389" opacity="0.8" />
      <path d="M170 74c10-14 28-20 42-18" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.75" />
      <circle cx="166" cy="92" r="4" fill="#fff" opacity="0.7" />
      {/* helmet lamp */}
      <rect x="262" y="58" width="22" height="14" rx="4" fill="#cfd6ea" />
      <circle cx="273" cy="65" r="4" fill="#5ee7ff" className="blink-led" />
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  rocket: <path d="M12 2c4 2 6 6 6 11l-3 3H9l-3-3c0-5 2-9 6-11zm0 6a2 2 0 100 4 2 2 0 000-4zM8 17l-3 4 5-1m6-3l3 4-5-1" />,
  mars: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M7 10c2 1 3 0 5 1s2 3 5 2M8 15c2-1 4 0 6 1" />
    </>
  ),
  galaxy: <path d="M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M4 12c0-5 6-8 10-6M20 12c0 5-6 8-10 6M6 6c4-2 10 0 12 4M18 18c-4 2-10 0-12-4" />,
  planet: (
    <>
      <circle cx="12" cy="12" r="6" />
      <ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-20 12 12)" />
    </>
  ),
  graph: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="12" cy="13" r="2.5" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M6.5 7.5l4 4M17.5 6.5l-4 5M10.5 14.5l-3 3M14 14.5l3.5 2.5" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5" />,
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
