"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUp, ChevronRight, Crosshair, Orbit, Radio, Satellite, ShieldCheck, Sparkles } from "lucide-react";
import { SpaceScene } from "@/components/SpaceScene";
import { getHealth } from "@/lib/api";

const stations = [
  { n: "01", title: "Mission Control", subtitle: "Apollo 13", description: "The mission is yours. Relive the critical hours, hear the crew, and guide Odyssey home.", color: "mint", icon: Radio, status: "FLIGHT READY", href: "/mission-control" },
  { n: "02", title: "Mars", subtitle: "NASA Image Archive", description: "Explore the red planet through the images and stories of every rover.", color: "ember", icon: Crosshair, status: "IMAGE ARCHIVE", href: "/mars" },
  { n: "03", title: "Starship", subtitle: "Exoplanet Explorer", description: "Find another Earth among thousands of distant worlds.", color: "sky", icon: Orbit, status: "DEEP SPACE", href: "/starship" },
  { n: "04", title: "Planet Lab", subtitle: "World Builder", description: "Build a world, balance its atmosphere, and ask: could life find a way?", color: "violet", icon: Sparkles, status: "EXPERIMENTAL", href: "/planet-lab" },
  { n: "05", title: "Knowledge Map", subtitle: "Mission Intelligence", description: "Connect discoveries and follow the science across the cosmos.", color: "gold", icon: Satellite, status: "CONNECTED", href: "/knowledge-map" },
  { n: "06", title: "Evaluation", subtitle: "Systems Check", description: "Put the mission intelligence to the test, one question at a time.", color: "mint", icon: ShieldCheck, status: "SYSTEMS CHECK", href: "/eval" },
];

const toTop = (e: React.MouseEvent) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

export default function Home() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    getHealth()
      .then((h) => setOnline(h.ok))
      .catch(() => setOnline(false));
  }, []);

  return (
    <main className="odyssey-home">
      <div className="home-sky" aria-hidden="true">
        <div className="sky-glow" />
        <div className="sky-scanline" />
      </div>
      <header className="top-bar">
        <a className="top-logo" href="#top" onClick={toTop}>
          <span className="brand-orbit">
            <i />
          </span>
          <span>ODYSSEY</span>
        </a>
        <div className="top-center">
          <span className={`live-dot ${online === false ? "down" : ""}`} /> MISSION NETWORK <span className="top-divider">/</span>{" "}
          {online === false ? "BACKEND OFFLINE" : "6 STATIONS ONLINE"}
        </div>
        <Link href="/mission-control" className="btn btn-outline btn-sm top-enter">
          ENTER MISSION <ArrowRight size={14} />
        </Link>
      </header>

      <section className="home-hero" id="top">
        <SpaceScene variant="hero" />
        <div className="hero-coordinates">
          <span>MISSION DIVISION</span>
          <span>34° 08′ 03.5″ N</span>
          <span>DEEP SPACE NETWORK · 2026</span>
        </div>
        <div className="hero-content">
          <span className="hero-kicker">
            <i /> A NEW PERSPECTIVE ON THE UNIVERSE
          </span>
          <h1>
            THE UNIVERSE
            <br />
            <span>ISN’T</span> OUT OF REACH<span className="hero-period">.</span>
          </h1>
          <p>
            A new way to explore the missions, discoveries, and questions
            <br className="desktop-break" /> that take us beyond Earth.
          </p>
          <Link href="/mission-control" className="btn hero-cta">
            BEGIN YOUR MISSION <ArrowRight size={15} />
          </Link>
          <div className="hero-note">
            <span>01</span>
            <span>YOUR MISSION STARTS HERE</span>
            <span className="note-line" />
          </div>
        </div>
        <div className="hero-side-index">
          <span>OBSERVATORY</span>
          <span>ORBIT 01</span>
          <span>INFINITY / 001</span>
        </div>
        <div className="hero-bottom">
          <div className="telemetry-label">
            <span className="live-dot" /> NETWORK STATUS <strong>{online === false ? "BACKEND OFFLINE" : "ALL SYSTEMS GO"}</strong>
          </div>
          <a className="scroll-cue" href="#stations">
            <span>SCROLL TO EXPLORE</span>
            <ChevronRight size={13} className="scroll-down" />
          </a>
          <div className="hero-mission-time">
            <span>MISSION ELAPSED TIME</span>
            <strong>00 : 00 : 00</strong>
          </div>
        </div>
      </section>

      <section className="stations-section" id="stations">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              <span>01</span> THE EXPEDITION
            </span>
            <h2>
              Choose your <em>destination.</em>
            </h2>
          </div>
          <p>
            One universe. Six ways to see it.
            <br />
            Where will your curiosity take you?
          </p>
        </div>
        <div className="station-grid">
          {stations.map((station, index) => {
            const Icon = station.icon;
            return (
              <Link key={station.n} href={station.href} className={`station-card station-${station.color}`} style={{ "--card-index": index } as React.CSSProperties}>
                <div className="station-card-top">
                  <span className="station-number">
                    {station.n} <span>/ 06</span>
                  </span>
                  <span className="station-status">
                    <i />
                    {station.status}
                  </span>
                </div>
                <div className="station-icon">
                  <Icon size={20} strokeWidth={1.35} />
                </div>
                <div className="station-card-bottom">
                  <span className="station-subtitle">{station.subtitle}</span>
                  <h3>
                    {station.title}
                    <ArrowRight className="station-arrow" size={19} />
                  </h3>
                  <p>{station.description}</p>
                  <div className="station-footer">
                    <span>
                      <span className="available-dot" /> AVAILABLE FOR EXPLORATION
                    </span>
                    <span>
                      ACCESS <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      <footer className="home-footer">
        <a className="footer-logo" href="#top" onClick={toTop}>
          <span className="brand-orbit">
            <i />
          </span>{" "}
          ODYSSEY
        </a>
        <span>MADE FOR THE CURIOUS. BUILT FOR THE COSMOS.</span>
        <span>
          EARTH · SOL SYSTEM <ArrowUp size={12} />
        </span>
      </footer>
    </main>
  );
}
