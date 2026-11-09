// Mission elapsed time (MET): seconds since lift-off, shown as DD:HH:MM:SS.

export function fmt(sec: number): string {
  const sign = sec < 0 ? "-" : "";
  const s = Math.floor(Math.abs(sec));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sign}${p(Math.floor(s / 86400))}:${p(Math.floor((s % 86400) / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function parse(label: string): number {
  const neg = label.startsWith("-");
  const [d, h, m, s] = label.replace("-", "").split(":").map(Number);
  const t = d * 86400 + h * 3600 + m * 60 + s;
  return neg ? -t : t;
}

/** Ground elapsed time in hours:minutes, the way 1970 flight controllers said it ("55:54"). */
export function get(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

// Key moments, in MET seconds.
export const T = {
  launch: 0,
  explosion: parse("02:07:55:19"), // "Okay, Houston - -"
  problem: parse("02:07:55:35"), // "Houston, we've had a problem."
  lmOnline: parse("02:09:40:00"), // about GET 57:40, Aquarius powered up as a lifeboat
  cmDown: parse("02:10:40:00"), // about GET 58:40, Odyssey powered down
  closestMoon: parse("03:07:27:00"), // end of the "To the Moon" act
  co2Rising: parse("03:08:37:33"), // Mission Control describes the "mailbox"
  scrubberDone: parse("03:19:12:29"), // first "mailbox" completed
  reentryPrep: parse("05:17:23:00"),
  lmJettison: parse("05:21:28:42"),
  splashdown: parse("05:22:38:36"),
};
