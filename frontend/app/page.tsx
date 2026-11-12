"use client";

import { useEffect, useState } from "react";
import { Footer, Header } from "@/components/selene/Chrome";
import { Earthrise } from "@/components/selene/Earthrise";
import { Launch } from "@/components/selene/Launch";
import { MissionLog } from "@/components/selene/MissionLog";
import { Stations } from "@/components/selene/Stations";
import { Trajectory } from "@/components/selene/Trajectory";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { getHealth } from "@/lib/api";
import { startScroll } from "@/lib/scroll";

export default function Home() {
  const reduced = useReducedMotion();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // The pinned stages depend on scroll position; always start at the top.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => startScroll(reduced), [reduced]);
  useEffect(() => {
    getHealth()
      .then((h) => setOnline(h.ok))
      .catch(() => setOnline(false));
  }, []);

  return (
    <div className="sl">
      <Header online={online} />
      <main>
        <Earthrise />
        <MissionLog />
        <Trajectory />
        <Stations />
        <Launch online={online} />
      </main>
      <Footer />
    </div>
  );
}
