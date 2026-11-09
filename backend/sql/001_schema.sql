-- ODYSSEY database, part 1: missions and the transcript RAG index.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again: it only creates what is missing.

create extension if not exists vector;

-- ---------- the mission and its structure ----------

create table if not exists missions (
  id          text primary key,          -- 'a13'
  title       text not null,
  summary     text,
  launch_utc  bigint                     -- seconds since 1970 at lift-off
);

create table if not exists mission_acts (
  mission_id  text references missions(id) on delete cascade,
  idx         int,
  title       text not null,
  description text,
  start_met   int not null,              -- mission elapsed time, in seconds
  end_met     int not null,
  primary key (mission_id, idx)
);

create table if not exists key_scenes (
  mission_id  text references missions(id) on delete cascade,
  idx         int,
  title       text not null,
  start_met   int not null,
  end_met     int not null,
  primary key (mission_id, idx)
);

create table if not exists speakers (
  mission_id  text references missions(id) on delete cascade,
  code        text,                      -- 'CDR'
  name        text,                      -- 'James A. (Jim) Lovell, Jr.'
  short_name  text,                      -- 'Jim Lovell (CDR)'
  role        text,                      -- 'astronaut', 'mission-ops', ...
  primary key (mission_id, code)
);

-- every line of the transcript, for the replay and the timeline
create table if not exists utterances (
  id          bigserial primary key,
  mission_id  text references missions(id) on delete cascade,
  met         int not null,
  speaker     text not null,
  text        text not null,
  page        int,
  tape        text,
  key_line    boolean default false
);
create index if not exists utterances_time on utterances (mission_id, met);

-- ---------- the RAG index ----------

-- one row per chunk: a few consecutive lines of conversation
create table if not exists chunks (
  id          bigserial primary key,
  mission_id  text references missions(id) on delete cascade,
  source      text not null default 'transcript',   -- later: 'mission_report', 'paper', ...
  start_met   int,
  end_met     int,
  speakers    text[],
  act         text,
  content     text not null,                         -- shown to the model and the user
  embedding   vector(384),                           -- BAAI/bge-small-en-v1.5
  fts         tsvector generated always as (to_tsvector('english', content)) stored
);
create index if not exists chunks_fts on chunks using gin (fts);
create index if not exists chunks_time on chunks (mission_id, end_met);
-- No HNSW index on purpose: a few thousand chunks are searched exactly (a "Flat"
-- search, like faiss.IndexFlatIP), and an approximate index would drop results when
-- the time filter removes most rows. Add one only past ~100,000 chunks.

-- ---------- hybrid search with a time filter ----------
-- Meaning (pgvector cosine) and exact words (Postgres full-text) are ranked
-- separately, then merged with Reciprocal Rank Fusion: score = sum of 1 / (k + rank).
-- max_met hides everything said after that moment, so a character "living" at that
-- mission time can never quote the future.

create or replace function hybrid_search(
  query_embedding  vector(384),
  keyword_query    text,                 -- OR-joined words, e.g. 'oxygen | tank | stir'
  match_count      int   default 30,
  mission          text  default 'a13',
  max_met          int   default null,
  min_met          int   default null,
  semantic_weight  float default 1.0,
  keyword_weight   float default 1.0,
  rrf_k            int   default 50
)
returns table (
  id            bigint,
  content       text,
  start_met     int,
  end_met       int,
  speakers      text[],
  act           text,
  source        text,
  similarity    float,
  semantic_rank bigint,
  keyword_rank  bigint,
  score         float
)
language sql stable
as $$
  with pool as (
    select c.*
    from chunks c
    where c.mission_id = mission
      and (max_met is null or c.end_met <= max_met)
      and (min_met is null or c.start_met >= min_met)
  ),
  semantic as (
    select p.id,
           1 - (p.embedding <=> query_embedding) as similarity,
           row_number() over (order by p.embedding <=> query_embedding) as rank_ix
    from pool p
    where p.embedding is not null
    order by p.embedding <=> query_embedding
    limit match_count * 2
  ),
  keyword as (
    select p.id,
           row_number() over (order by ts_rank_cd(p.fts, to_tsquery('english', keyword_query)) desc) as rank_ix
    from pool p
    where coalesce(keyword_query, '') <> ''
      and p.fts @@ to_tsquery('english', keyword_query)
    order by ts_rank_cd(p.fts, to_tsquery('english', keyword_query)) desc
    limit match_count * 2
  )
  select c.id, c.content, c.start_met, c.end_met, c.speakers, c.act, c.source,
         s.similarity,
         s.rank_ix as semantic_rank,
         k.rank_ix as keyword_rank,
         coalesce(semantic_weight / (rrf_k + s.rank_ix), 0.0)
           + coalesce(keyword_weight / (rrf_k + k.rank_ix), 0.0) as score
  from semantic s
  full outer join keyword k on s.id = k.id
  join chunks c on c.id = coalesce(s.id, k.id)
  order by score desc
  limit match_count;
$$;

-- The backend connects with the database password, so it bypasses Row Level Security.
-- Turn RLS on so the public website keys cannot read or change these tables directly.
alter table missions      enable row level security;
alter table mission_acts  enable row level security;
alter table key_scenes    enable row level security;
alter table speakers      enable row level security;
alter table utterances    enable row level security;
alter table chunks        enable row level security;
