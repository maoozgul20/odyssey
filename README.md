# ODYSSEY

**A space mission game powered by RAG.** You are a NASA flight director in training. An AI companion, FLIGHT, guides you through four stations, from Apollo 13 in 1970 to planets around other stars. It only speaks from real NASA transcripts, reports, data tables, papers and photos, and cites every fact.

| Station | What you do | Retrieval used |
|---|---|---|
| 1. Mission Control | Relive the Apollo 13 emergency and talk to the crew | Time-filtered transcript retrieval |
| 2. Mars Surface Ops | Click rocks on a Mars panorama | Image retrieval (multimodal) |
| 3. Starship Navigation | Fly through 6,000+ real exoplanets | Table + paper retrieval |
| 4. Planet Lab | Build a planet; AI scientists debate it | Table + paper retrieval, agents |
| Knowledge Map | See how everything connects | Graph retrieval (GraphRAG) |

## Build status

- [x] **Phase 1a: the RAG foundation.** Apollo 13 transcript parsed into 11,264 timestamped lines and 2,264 conversation chunks, stored in Supabase with vectors and full-text search. FastAPI backend with hybrid search, reranking, a time filter and streaming grounded answers.
- [ ] Phase 1b: Mission Control screen (Next.js)
- [ ] Phase 2: Starship Navigation (exoplanet table, 3D galaxy)
- [ ] Phase 3: Planet Lab
- [ ] Phase 4: Mars Surface Ops (image retrieval)
- [ ] Phase 5: Knowledge graph, Knowledge Map and evaluation dashboard

## How retrieval works (phase 1a)

```
question
  ├─ embed with BAAI/bge-small-en-v1.5 ─────► vector search (pgvector, exact cosine)
  └─ keywords ("o2 | tank | undervolt") ────► full-text search (Postgres)
                                                    │
                     both rankings fused with Reciprocal Rank Fusion
                     + time filter: only lines spoken before max_met
                                                    │
                   cross-encoder reranker (ms-marco-MiniLM) keeps the best 5
                                                    │
         prompt: numbered transcript excerpts + rules (cite [n], no outside facts)
                                                    │
                        Groq (gpt-oss-120b), streamed answer
```

**Crew mode** makes the model speak as Jim Lovell, Fred Haise, Jack Swigert or CapCom at a chosen mission time. It only retrieves lines spoken before that moment, plus the last two exchanges they just heard, so the crew can never "know the future".

## Data

- **Apollo 13 air-to-ground transcript:** NASA (public domain), as cleaned and structured by [Spacelog](https://github.com/Spacelog/Spacelog) (code CC0). Includes mission acts, key scenes and speaker names.

## Project layout

```
backend/
  app/
    main.py          API endpoints
    rag.py           hybrid retrieval, reranking, prompts
    transcript.py    transcript parser and chunker
    embeddings.py    embedding model and reranker
    llm.py           streaming answers (Groq or any OpenAI-compatible API)
    db.py, config.py
  scripts/
    ingest_apollo13.py   download, parse, chunk, embed, upload
  sql/
    001_schema.sql   tables + hybrid_search() for Supabase
  tests/             unit tests (pytest)
```

## Setup (Windows)

### 1. Create the database tables
Supabase → your project → **SQL Editor** → **New query** → paste all of `backend/sql/001_schema.sql` → **Run**. You should see "Success".

### 2. Install the backend
In VS Code, open the `odyssey` folder, then open a terminal:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

If `activate` is blocked, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, answer Y, and try again.

### 3. Add your keys
Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL` (Supabase → **Connect** → **Session pooler**) and `LLM_API_KEY` (your Groq key).

### 4. Load Apollo 13
```bash
python scripts/ingest_apollo13.py
```
It downloads the transcript and the embedding model once, then uploads everything. It takes about 2 to 5 minutes and ends with "Done".

### 5. Run the API
```bash
uvicorn app.main:app --reload --port 8000
```
Open **http://localhost:8000/docs** to try every endpoint in the browser.

## API

| Endpoint | What it does |
|---|---|
| `GET /health` | Database and AI status, number of chunks |
| `GET /missions/a13` | Acts, key scenes, speakers, time span |
| `GET /missions/a13/utterances?start=&end=` | Radio lines between two mission times (seconds), for the replay |
| `POST /search` | `{query, k, max_met?}` → reranked passages with scores |
| `POST /ask` | `{question, mode: "flight"\|"crew", persona: "CDR"\|"LMP"\|"CMP"\|"CC", max_met?}` → streamed answer (server-sent events: `sources`, `token`, `done`) |

Mission times are in seconds from lift-off: `02:07:55:35` (2 days, 7 h, 55 min, 35 s) is `201335`.

## Tests

```bash
pytest -q
```
