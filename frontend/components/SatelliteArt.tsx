// A detailed satellite drawn in SVG: gold-foil body, two solar wings with a moving
// sun glint, a dish antenna, booms and a blinking beacon.

export function SatelliteArt() {
  const wing = (x: number, flip: boolean) => (
    <g transform={`translate(${x} 0)`}>
      <rect x="0" y="34" width="150" height="52" fill="url(#sa-cells)" stroke="#9fb6d9" strokeWidth="1" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={(i + 1) * 15} x2={(i + 1) * 15} y1="34" y2="86" stroke="#0a1430" strokeWidth="1.2" />
      ))}
      <line x1="0" x2="150" y1="51" y2="51" stroke="#0a1430" strokeWidth="1.2" />
      <line x1="0" x2="150" y1="69" y2="69" stroke="#0a1430" strokeWidth="1.2" />
      <rect x="0" y="34" width="150" height="52" fill="url(#sa-glint)" className={`sa-glint ${flip ? "late" : ""}`} />
    </g>
  );
  return (
    <svg viewBox="0 0 440 130" className="sat-art" role="img" aria-label="Satellite">
      <defs>
        <linearGradient id="sa-cells" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#1d3a8a" />
          <stop offset="0.5" stopColor="#0f2160" />
          <stop offset="1" stopColor="#2a4fae" />
        </linearGradient>
        <linearGradient id="sa-glint" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#bfe0ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sa-foil" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.3" stopColor="#d9a43c" />
          <stop offset="0.55" stopColor="#f6cf6e" />
          <stop offset="0.8" stopColor="#a8761f" />
          <stop offset="1" stopColor="#e2b453" />
        </linearGradient>
        <radialGradient id="sa-dish" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#c9d1de" />
          <stop offset="1" stopColor="#6c7686" />
        </radialGradient>
        <radialGradient id="sa-beacon">
          <stop offset="0" stopColor="#ff5a64" />
          <stop offset="1" stopColor="#ff5a64" stopOpacity="0" />
        </radialGradient>
      </defs>
      {wing(0, false)}
      {wing(290, true)}
      {/* booms joining the wings to the body */}
      <rect x="150" y="57" width="30" height="6" fill="#b8c0cc" />
      <rect x="260" y="57" width="30" height="6" fill="#b8c0cc" />
      {/* body wrapped in gold foil, with crinkles */}
      <rect x="180" y="30" width="80" height="62" rx="4" fill="url(#sa-foil)" />
      <path d="M186 40l16 6 10-4 14 7 12-5 16 5M186 60l14-4 12 6 16-6 12 5 14-3M186 80l18 3 12-6 14 5 18-4" stroke="#8a5e14" strokeOpacity="0.45" fill="none" />
      <rect x="180" y="30" width="80" height="62" rx="4" fill="none" stroke="#7a5512" strokeOpacity="0.6" />
      {/* instrument module and lens */}
      <rect x="196" y="92" width="48" height="16" rx="2" fill="#d6dbe4" />
      <circle cx="220" cy="112" r="7" fill="#0b1324" stroke="#9aa6b8" strokeWidth="2" />
      <circle cx="218" cy="110" r="2" fill="#7fd0ff" />
      {/* dish antenna on a mast */}
      <rect x="218" y="12" width="4" height="18" fill="#b8c0cc" />
      <ellipse cx="220" cy="10" rx="22" ry="8" fill="url(#sa-dish)" stroke="#7d8696" />
      <line x1="220" y1="10" x2="220" y2="-2" stroke="#b8c0cc" strokeWidth="2" />
      {/* whip antennas */}
      <line x1="262" y1="34" x2="282" y2="14" stroke="#cfd6e2" strokeWidth="1.5" />
      <line x1="178" y1="88" x2="160" y2="110" stroke="#cfd6e2" strokeWidth="1.5" />
      {/* blinking beacon */}
      <circle cx="252" cy="38" r="9" fill="url(#sa-beacon)" className="sa-beacon" />
      <circle cx="252" cy="38" r="2.2" fill="#ff8a90" className="sa-beacon" />
    </svg>
  );
}
