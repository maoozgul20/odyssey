/** Every word on the ODYSSEY home page. */

export const brand = { name: "Odyssey", wordmark: "ODYSSEY" };

export const nav = [
  { label: "Pipeline", href: "#log" },
  { label: "Trajectory", href: "#trajectory" },
  { label: "Stations", href: "#stations" },
  { label: "Launch", href: "#launch" },
];

export const hero = {
  title: "ODYSSEY",
  kicker: "A mission through real NASA data · powered by RAG",
  site: "Apollo 13 · Mars · Exoplanets · 6 stations",
};

export const intro = {
  eyebrow: "The pipeline",
  heading: "Every answer is retrieved before it is written.",
  body: "Ask a question and ODYSSEY goes to the record first: the radio transcripts, the pictures, the papers, the tables. This is the journey of one question, frame by frame.",
};

export const log = [
  { tag: "Step 1", title: "Ask", body: "Your question arrives. A short rewrite turns a vague wording into a precise search.", image: "/media/cards/m1-launch.webp" },
  { tag: "Step 2", title: "Retrieve", body: "Vector search and full-text search run side by side and are merged by rank.", image: "/media/cards/m2-orbit.webp" },
  { tag: "Step 3", title: "Rerank", body: "A cross-encoder reads each candidate with your question and drops the weak ones.", image: "/media/cards/m3-base.webp" },
  { tag: "Step 4", title: "Cite", body: "The answer is written only from the evidence, every line pointing back to its source.", image: "/media/cards/m4-walk.webp" },
];

/** Legs of the Question -> Answer trajectory, in drawing order. */
export const trajectory = {
  eyebrow: "Trajectory",
  heading: "From question to answer, drawn as you scroll.",
  legs: [
    { day: "Step 1", title: "Query rewriting", body: "A vague question becomes a precise search before anything is retrieved." },
    { day: "Step 2", title: "Hybrid retrieval", body: "Meaning (vectors) and exact words (full text) are searched together, then fused with reciprocal-rank fusion." },
    { day: "Step 3", title: "Cross-encoder rerank", body: "A second model reads every candidate next to the question and cuts the weak ones." },
    { day: "Step 4", title: "Grounded answer", body: "The model answers only from the evidence and cites it, or says the record does not cover the question." },
  ],
};

export type StationItem = {
  n: number;
  name: string;
  rag: string;
  href: string;
  lines: string[];
  cta: string;
  featured?: boolean;
};

export const stations = {
  eyebrow: "Stations",
  heading: "Six ways to explore.",
  note: "Each station uses a different kind of RAG.",
  items: [
    { n: 1, name: "Mission Control", rag: "Time-filtered hybrid RAG", href: "/mission-control", lines: ["Apollo 13 radio replay with cited answers", "Decision points and a final debrief", "Only knows what had been said so far"], cta: "Enter Mission Control", featured: true },
    { n: 2, name: "Mars", rag: "Multimodal RAG", href: "/mars", lines: ["Search NASA pictures by describing them", "Search with a photo of your own", "Science briefing with cited pictures"], cta: "Open the Mars archive" },
    { n: 3, name: "Starship", rag: "Table + paper RAG", href: "/starship", lines: ["A 3D galaxy of exoplanets", "The model plans, the server validates the SQL", "Papers cited beside the numbers"], cta: "Board the Starship" },
    { n: 4, name: "Planet Lab", rag: "Agentic RAG", href: "/planet-lab", lines: ["Find Earth-like analogs", "Advocate and skeptic debate with evidence", "A chair weighs both and decides"], cta: "Enter the Planet Lab" },
    { n: 5, name: "Knowledge Map", rag: "GraphRAG", href: "/knowledge-map", lines: ["Entities linked into a graph", "One-hop expansion around your question", "Evidence on every node and edge"], cta: "Open the Knowledge Map" },
    { n: 6, name: "Evaluation", rag: "Measured, not guessed", href: "/eval", lines: ["Hit@1/3/5 and MRR for four retrieval modes", "Coverage accuracy on unanswerable questions", "LLM-judged faithfulness"], cta: "Run the systems check" },
  ] as StationItem[],
};

export const launch = {
  eyebrow: "Launch",
  heading: "Ready when you are.",
  body: "Start the backend, open Mission Control, and ask the record anything.",
  stats: [
    { label: "Stations", value: "6" },
    { label: "Test questions", value: "28" },
    { label: "Hit@3 rerank", value: "44%" },
    { label: "MRR@10", value: "0.36" },
  ],
  repo: "https://github.com/maoozgul20/odyssey",
};
