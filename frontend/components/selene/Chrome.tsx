"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { brand, nav } from "./content";
import { scrollToHash } from "@/lib/scroll";

function go(e: MouseEvent<HTMLAnchorElement>, then?: () => void) {
  const hash = e.currentTarget.getAttribute("href");
  if (!hash?.startsWith("#")) return;
  e.preventDefault();
  then?.();
  scrollToHash(hash);
}

/** A crescent: the mark. */
export function Crescent({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M15.5 3.2A9 9 0 1 0 20.8 16 7.2 7.2 0 0 1 15.5 3.2Z" fill="currentColor" />
    </svg>
  );
}

export function Header({ online }: { online: boolean | null }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sl-header">
      <div className="sl-header-row">
        <a href="#top" onClick={(e) => go(e)} className="sl-brand" aria-label={`${brand.name}: back to top`}>
          <Crescent className="sl-crescent" />
          <span>{brand.wordmark}</span>
        </a>
        <nav aria-label="Primary" className="sl-nav">
          {nav.map((item) => (
            <a key={item.href} href={item.href} onClick={(e) => go(e)}>
              {item.label}
            </a>
          ))}
          <span className={`sl-status ${online === false ? "down" : ""}`} title="Backend status">
            <i /> {online === false ? "Backend offline" : online ? "Network online" : "Connecting"}
          </span>
          <Link href="/mission-control" className="sl-btn sl-btn-white">
            Enter mission
          </Link>
        </nav>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="sl-menu" className="sl-menu-btn">
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <div id="sl-menu" className={`sl-menu ${open ? "open" : ""}`} aria-hidden={!open}>
        {nav.map((item, i) => (
          <a key={item.href} href={item.href} tabIndex={open ? 0 : -1} onClick={(e) => go(e, () => setOpen(false))}>
            <span>0{i + 1}</span>
            {item.label}
          </a>
        ))}
        <Link href="/mission-control" tabIndex={open ? 0 : -1}>
          <span>→</span>Enter mission
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="sl-footer">
      <span className="sl-footer-brand">
        <Crescent className="sl-crescent small" />
        {brand.wordmark} · RAG over real NASA data
      </span>
      <span>© {new Date().getFullYear()} · Imagery generated for this concept</span>
      <a href="#top" onClick={(e) => go(e)}>
        Back to the surface ↑
      </a>
    </footer>
  );
}
