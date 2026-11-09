"use client";

import { useEffect, useRef, useState } from "react";
import { Answer } from "@/components/Answer";
import { Shell } from "@/components/Shell";
import { API, getJSON, post, stream } from "@/lib/api";

type Img = { nasa_id: string; title: string; description: string; date_created: string | null; center: string | null; keywords: string[]; thumb_url: string; page_url: string; similarity?: number; rerank?: number };

const EXAMPLES = ["a dust devil", "blue sunset", "rover selfie", "helicopter", "layered rocks", "giant volcano", "sand dunes", "ice cap", "rover wheel tracks"];

export default function Mars() {
  const [images, setImages] = useState<Img[]>([]);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<{ kind: "gallery" | "text" | "similar" | "upload"; label: string }>({ kind: "gallery", label: "A random selection" });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Img | null>(null);
  const [brief, setBrief] = useState("");
  const [briefImgs, setBriefImgs] = useState<Img[]>([]);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefErr, setBriefErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getJSON<{ total: number; images: Img[] }>("/mars/gallery")
      .then((d) => {
        setImages(d.images);
        setTotal(d.total);
      })
      .catch(() => setErr("No Mars pictures yet. Run python scripts/ingest_mars.py in the backend folder, then reload."));
  }, []);

  const run = async (fn: () => Promise<Img[]>, m: typeof mode) => {
    setBusy(true);
    setErr(null);
    setBrief("");
    setBriefImgs([]);
    try {
      setImages(await fn());
      setMode(m);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  };

  const searchText = (text: string) => {
    if (!text.trim()) return;
    setQ(text);
    run(async () => (await post<{ images: Img[] }>("/mars/search", { query: text, k: 30 })).images, { kind: "text", label: `Pictures that look like “${text}”` });
  };
  const moreLike = (img: Img) => {
    setOpen(null);
    run(async () => (await getJSON<{ images: Img[] }>(`/mars/similar/${encodeURIComponent(img.nasa_id)}?k=30`)).images, { kind: "similar", label: `More like “${img.title}”` });
  };
  const upload = (f: File) =>
    run(
      async () => {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch(`${API}/mars/upload?k=30`, { method: "POST", body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `Upload failed (HTTP ${r.status}).`);
        return (await r.json()).images;
      },
      { kind: "upload", label: `Pictures that look like your photo “${f.name}”` },
    );

  const briefMe = async () => {
    const query = q.trim() || "What do these pictures show about Mars?";
    setBriefBusy(true);
    setBrief("");
    setBriefErr(null);
    try {
      await stream("/mars/brief", { query, ids: mode.kind === "text" ? null : images.slice(0, 8).map((i) => i.nasa_id) }, (ev, data) => {
        if (ev === "sources") setBriefImgs(data.images);
        else if (ev === "token") setBrief((b) => b + data);
        else if (ev === "error") setBriefErr(data);
      });
    } catch {
      setBriefErr("Lost contact with the backend.");
    } finally {
      setBriefBusy(false);
    }
  };

  return (
    <Shell current="/mars" station="mars" title="Mars" rag="Multimodal RAG: CLIP image vectors + caption keywords, fused with RRF">
      <main className="st-main mars">
        <section className="panel pad mars-search">
          <form
            className="askbar"
            onSubmit={(e) => {
              e.preventDefault();
              searchText(q);
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe what you want to see on Mars…" aria-label="Describe a picture" />
            <button type="submit" className="go" disabled={busy || !q.trim()}>
              Search
            </button>
            <button type="button" className="ghost" onClick={() => file.current?.click()} disabled={busy}>
              Search with a photo
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </form>
          <ul className="chips">
            {EXAMPLES.map((x) => (
              <li key={x}>
                <button type="button" onClick={() => searchText(x)}>
                  {x}
                </button>
              </li>
            ))}
          </ul>
          <div className="mars-bar">
            <span>
              {mode.label} {total ? `· ${total.toLocaleString()} NASA pictures indexed` : ""}
            </span>
            <button type="button" className="go small" onClick={briefMe} disabled={briefBusy || images.length === 0}>
              {briefBusy ? "Writing…" : "Brief me on these"}
            </button>
          </div>
          {err && <p className="answer-err">{err}</p>}
          <Answer text={brief} count={briefImgs.length} busy={briefBusy} error={briefErr} label="Science briefing" onCite={(n) => briefImgs[n - 1] && setOpen(briefImgs[n - 1])} />
          {briefImgs.length > 0 && (
            <ol className="brief-strip">
              {briefImgs.map((im, i) => (
                <li key={im.nasa_id}>
                  <button type="button" onClick={() => setOpen(im)}>
                    <b>[{i + 1}]</b>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.thumb_url} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <ul className={`gallery ${busy ? "dim" : ""}`}>
          {images.map((im) => (
            <li key={im.nasa_id}>
              <button type="button" onClick={() => setOpen(im)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.thumb_url} alt={im.title} loading="lazy" />
                <span>{im.title}</span>
                {im.similarity != null && (mode.kind === "similar" || mode.kind === "upload") && <small>{Math.round(im.similarity * 100)}% similar</small>}
              </button>
            </li>
          ))}
        </ul>

        {open && (
          <div className="decision" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpen(null)}>
            <div className="decision-card mars-view" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={open.thumb_url.replace("~thumb", "~medium")} onError={(e) => ((e.target as HTMLImageElement).src = open.thumb_url)} alt={open.title} />
              <h2>{open.title}</h2>
              <p className="dec-kicker">
                {open.date_created ?? "undated"} · {open.center ?? "NASA"} · {open.nasa_id}
              </p>
              <p className="small">{open.description.slice(0, 900)}</p>
              <div className="dec-actions">
                <a className="ghost" href={open.page_url} target="_blank" rel="noreferrer">
                  NASA page
                </a>
                <button type="button" className="go" onClick={() => moreLike(open)}>
                  More like this
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </Shell>
  );
}
