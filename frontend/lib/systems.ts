// Annunciator lights for the systems panel, driven by mission time.
// The times are keyed to the transcript's key scenes and the mission's ground elapsed
// times; they are an illustration of the crisis, not a telemetry replay.

import { T } from "./met";

export type Light = { id: string; label: string; state: "off" | "ok" | "caution" | "warning"; text: string };

export function systems(met: number): Light[] {
  const after = (t: number) => met >= t;
  const done = after(T.splashdown);
  return [
    {
      id: "o2",
      label: "O2 tank 2",
      state: after(T.explosion) ? "warning" : "ok",
      text: after(T.explosion) ? "Lost" : "Nominal",
    },
    {
      id: "bus",
      label: "Main bus B",
      state: after(T.cmDown) ? "off" : after(T.explosion) ? "caution" : "ok",
      text: after(T.cmDown) ? "Off" : after(T.explosion) ? "Undervolt" : "Nominal",
    },
    {
      id: "fc",
      label: "Fuel cells",
      state: after(T.cmDown) ? "warning" : after(T.explosion) ? "caution" : "ok",
      text: after(T.cmDown) ? "Offline" : after(T.explosion) ? "Failing" : "3 on line",
    },
    {
      id: "cm",
      label: "Odyssey (CM)",
      state: done ? "ok" : after(T.reentryPrep) ? "ok" : after(T.cmDown) ? "caution" : "ok",
      text: done ? "Splashdown" : after(T.reentryPrep) ? "Powered up" : after(T.cmDown) ? "Powered down" : "Powered",
    },
    {
      id: "lm",
      label: "Aquarius (LM)",
      state: after(T.lmJettison) ? "off" : after(T.lmOnline) ? "ok" : "off",
      text: after(T.lmJettison) ? "Jettisoned" : after(T.lmOnline) ? "Lifeboat on" : "Dormant",
    },
    {
      id: "co2",
      label: "Cabin CO2",
      state: after(T.scrubberDone) ? "ok" : after(T.co2Rising) ? "warning" : "ok",
      text: after(T.scrubberDone) ? "Scrubber fixed" : after(T.co2Rising) ? "Rising" : "Nominal",
    },
  ];
}
