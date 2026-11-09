// The ODYSSEY backend: mission data, the radio replay and streaming answers.

export const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Act = { idx: number; title: string; description: string; start_met: number; end_met: number };
export type Scene = { idx: number; title: string; start_met: number; end_met: number };
export type Mission = { id: string; title: string; acts: Act[]; key_scenes: Scene[]; span: { first: number; last: number; lines: number } };
export type Line = { met: number; time: string; speaker: string; text: string; key_line: boolean };
export type Hit = { id: number; content: string; start_met: number; end_met: number; start: string; end: string; act: string | null; rerank: number };
export type Sources = { covered: boolean; query: string; rewritten: boolean; hits: Hit[] };

async function json<T>(path: string): Promise<T> {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`The backend returned HTTP ${r.status} for ${path}.`);
  return r.json();
}

export const getMission = () => json<Mission>("/missions/a13");
export const getLines = (start: number, end: number) => json<Line[]>(`/missions/a13/utterances?start=${Math.floor(start)}&end=${Math.ceil(end)}&limit=1000`);
export const getHealth = () => json<{ ok: boolean; chunks: number; llm: boolean; model: string }>("/health");

export type AskBody = { question: string; mode: "flight" | "crew"; persona?: string; max_met?: number | null; k?: number };

/** POST /ask and read the server-sent events as they arrive. */
export async function ask(
  body: AskBody,
  on: { sources: (s: Sources) => void; token: (t: string) => void; error: (e: string) => void },
  signal?: AbortSignal,
) {
  const r = await fetch(API + "/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`The backend returned HTTP ${r.status}.`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!ev || data === undefined) continue;
      const v = JSON.parse(data);
      if (ev === "sources") on.sources(v);
      else if (ev === "token") on.token(v);
      else if (ev === "error") on.error(v);
    }
  }
}

// ---------- decision points ----------
export type Option = { id: string; text: string };
export type Decision = { id: string; title: string; decide_at: string; decide_met: number; question: string; options: Option[] };
export type Verdict = {
  id: string;
  correct: boolean;
  choice: string;
  nasa_choice: string;
  nasa_text: string;
  explanation: string;
  evidence: Hit[];
};
export const getDecisions = () => json<Decision[]>("/decisions");
export async function answerDecision(id: string, choice: string): Promise<Verdict> {
  const r = await fetch(`${API}/decisions/${id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choice }) });
  if (!r.ok) throw new Error(`The backend returned HTTP ${r.status}.`);
  return r.json();
}

/** POST any endpoint that streams server-sent events; calls on(event, data) for each one. */
export async function stream(path: string, body: unknown, on: (event: string, data: any) => void, signal?: AbortSignal) {
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) throw new Error(`The backend returned HTTP ${r.status}.`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (ev && data !== undefined) on(ev, JSON.parse(data));
    }
  }
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`The backend returned HTTP ${r.status} for ${path}.`);
  return r.json();
}
export const getJSON = json;
