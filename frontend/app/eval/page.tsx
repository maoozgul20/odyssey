"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Art";
import { Shell } from "@/components/Shell";
import { getJSON } from "@/lib/api";

type Summary = Record<string, { "hit@1": number; "hit@3": number; "hit@5": number; "mrr@10": number }>;
type Result = {
  run_at: string;
  seconds: number;
  questions: number;
  unanswerable: number;
  methods: string[];
  summary: Summary;
  coverage_accuracy: number;
  coverage: { q: string; answerable: boolean; covered: boolean; top_rerank: number | null }[];
  per_question: { q: string; expect: string[]; ranks: Record<string, number | null> }[];
  answers?: { faithfulness: number | null; keyword_accuracy: number | null; rows: { q: string; answer: string; faithfulness: number | null; keywords_found: boolean | null }[] };
};

const METRICS = ["hit@1", "hit@3", "hit@5", "mrr@10"] as const;
const COLORS: Record<string, string> = { semantic: "#6fd3ff", keyword: "#ffb648", hybrid: "#b78cff", "hybrid+rerank": "#8dffb0" };

function Bars({ summary, methods }: { summary: Summary; methods: string[] }) {
  const W = 640, H = 260, pad = 34, group = (W - pad) / METRICS.length, bw = (group - 24) / methods.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="bars" role="img" aria-label="Retrieval quality by method">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={pad} x2={W} y1={H - t * (H - 10)} y2={H - t * (H - 10)} className="gridline" />
          <text x={pad - 6} y={H - t * (H - 10) + 4} className="tick" textAnchor="end">
            {t * 100}%
          </text>
        </g>
      ))}
      {METRICS.map((m, gi) => (
        <g key={m} transform={`translate(${pad + gi * group + 12},0)`}>
          {methods.map((meth, i) => {
            const v = summary[meth][m];
            const h = v * (H - 10);
            return (
              <g key={meth}>
                <rect x={i * bw} y={H - h} width={bw - 4} height={h} rx={2} fill={COLORS[meth]}>
                  <title>{`${meth} ${m}: ${(v * 100).toFixed(0)}%`}</title>
                </rect>
                <text x={i * bw + (bw - 4) / 2} y={H - h - 4} className="val" textAnchor="middle">
                  {Math.round(v * 100)}
                </text>
              </g>
            );
          })}
          <text x={(group - 24) / 2} y={H + 20} className="mlabel" textAnchor="middle">
            {m.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Eval() {
  const [r, setR] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getJSON<Result>("/eval").then(setR).catch((e) => setErr(String(e.message || e)));
  }, []);

  return (
    <Shell current="/eval" station="eval" title="Evaluation" rag="Measured, not claimed: four retrieval methods on questions with known answers">
      <main className="st-main eval">
        {err && (
          <section className="panel pad">
            <h2>No evaluation yet</h2>
            <p>In the backend folder, with the virtual environment on, run:</p>
            <pre className="cmd">python scripts/run_eval.py</pre>
            <p className="muted">Add --answers to also have the model write and judge 25 answers.</p>
          </section>
        )}
        {r && (
          <>
            <section className="kpis">
              <div className="kpi k1">
                <Icon name="target" size={34} />
                <b>{Math.round(r.summary["hybrid+rerank"]["hit@5"] * 100)}%</b>
                <span>Hit@5, full pipeline</span>
              </div>
              <div className="kpi k2">
                <Icon name="trend" size={34} />
                <b>{r.summary["hybrid+rerank"]["mrr@10"].toFixed(2)}</b>
                <span>MRR@10, full pipeline</span>
              </div>
              <div className="kpi k3">
                <Icon name="shield" size={34} />
                <b>{Math.round(r.coverage_accuracy * 100)}%</b>
                <span>Knows when it doesn&apos;t know</span>
              </div>
              {r.answers?.faithfulness != null && (
                <div className="kpi k4">
                  <Icon name="database" size={34} />
                  <b>{Math.round(r.answers.faithfulness * 100)}%</b>
                  <span>Answer claims supported by sources</span>
                </div>
              )}
            </section>

            <section className="panel pad">
              <header className="panel-head">
                <h2>Retrieval quality by method</h2>
                <span className="hint">
                  {r.questions} questions · run {r.run_at}
                </span>
              </header>
              <div className="legend">
                {r.methods.map((m) => (
                  <span key={m}>
                    <i style={{ background: COLORS[m] }} />
                    {m}
                  </span>
                ))}
              </div>
              <Bars summary={r.summary} methods={r.methods} />
              <p className="muted small">
                Hit@k: the chunk that answers the question is in the top k. MRR: 1 ÷ the rank of the first correct chunk, averaged. Each question has
                a known answer time in the transcript; a chunk counts if it covers that time.
              </p>
            </section>

            <section className="panel pad">
              <header className="panel-head">
                <h2>Every question</h2>
                <span className="hint">rank of the first correct chunk (— = not in top 10)</span>
              </header>
              <div className="table-wrap">
                <table className="qtable">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Answer at</th>
                      {r.methods.map((m) => (
                        <th key={m}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.per_question.map((q) => (
                      <tr key={q.q}>
                        <td>{q.q}</td>
                        <td className="mono">{q.expect[0]}</td>
                        {r.methods.map((m) => {
                          const k = q.ranks[m];
                          return (
                            <td key={m} className={`rank ${k === 1 ? "r1" : k && k <= 5 ? "r5" : k ? "r10" : "miss"}`}>
                              {k ?? "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel pad">
              <header className="panel-head">
                <h2>Does it know when it doesn&apos;t know?</h2>
                <span className="hint">top cross-encoder score vs. the coverage threshold</span>
              </header>
              <ul className="cov">
                {r.coverage.map((c) => (
                  <li key={c.q} className={c.covered === c.answerable ? "ok" : "no"}>
                    <span>{c.answerable ? "answerable" : "not in transcript"}</span>
                    <p>{c.q}</p>
                    <b>{c.covered ? "covered" : "not covered"}</b>
                    <small>{c.top_rerank ?? "none"}</small>
                  </li>
                ))}
              </ul>
            </section>

            {r.answers && (
              <section className="panel pad">
                <header className="panel-head">
                  <h2>Generated answers, judged</h2>
                  <span className="hint">faithfulness scored by a second model call</span>
                </header>
                <ul className="judged">
                  {r.answers.rows.map((a) => (
                    <li key={a.q}>
                      <p className="q">{a.q}</p>
                      <p>{a.answer}</p>
                      <small>
                        faithfulness {a.faithfulness ?? "?"} · expected words {a.keywords_found == null ? "n/a" : a.keywords_found ? "found" : "missing"}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
