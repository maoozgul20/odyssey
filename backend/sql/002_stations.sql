-- ODYSSEY stations 2 to 5: Mars images, exoplanets, papers and the knowledge graph.
-- Run this once in the Supabase SQL editor (after 001_schema.sql). It is safe to run again.

create extension if not exists vector;

-- ---------- Station 3: Starship (a table of real exoplanets) ----------
create table if not exists planets (
  name          text primary key,
  host          text not null,
  dist_pc       real,          -- distance from the Sun in parsecs (1 pc = 3.26 light years)
  ra            real,          -- sky position, degrees
  dec           real,
  radius        real,          -- Earth radii
  mass          real,          -- Earth masses
  period        real,          -- orbital period, days
  semi_major    real,          -- AU
  eccentricity  real,
  eq_temp       real,          -- equilibrium temperature, kelvin
  insolation    real,          -- starlight received, Earth = 1
  star_teff     real,          -- star temperature, kelvin
  star_radius   real,          -- Sun radii
  star_mass     real,          -- Sun masses
  star_type     text,
  planets_in_system int,
  disc_year     int,
  disc_method   text,
  disc_facility text,
  size_class    text,          -- Earth-size, Super-Earth, Sub-Neptune, Neptune-like, Gas giant
  in_hz         boolean,       -- inside the (optimistic) habitable zone
  esi           real,          -- Earth Similarity Index, 0 to 1
  description   text not null, -- a sentence card built from the numbers, used for semantic search
  embedding     vector(384),
  fts           tsvector generated always as (to_tsvector('english', name || ' ' || host || ' ' || description)) stored
);
create index if not exists planets_fts on planets using gin (fts);
create index if not exists planets_host on planets (host);

-- ---------- Station 3 and 4: research papers (arXiv abstracts) ----------
create table if not exists papers (
  id         text primary key,      -- arXiv id, e.g. 2310.01234
  title      text not null,
  abstract   text not null,
  authors    text[] not null default '{}',
  published  date,
  topic      text,                  -- which search found it
  url        text,
  mentions   text[] not null default '{}',  -- star systems from the planets table named in the paper
  embedding  vector(384),
  fts        tsvector generated always as (to_tsvector('english', title || ' ' || abstract)) stored
);
create index if not exists papers_fts on papers using gin (fts);

-- ---------- Station 2: Mars (NASA images) ----------
create table if not exists mars_images (
  nasa_id      text primary key,
  title        text not null,
  description  text not null default '',
  date_created date,
  center       text,
  keywords     text[] not null default '{}',
  keyword_text text not null default '',   -- the keywords joined by spaces (for full-text search)
  thumb_url    text not null,
  page_url     text,
  clip         vector(512),     -- CLIP image vector: pictures and words share this space
  fts          tsvector generated always as (to_tsvector('english', title || ' ' || description || ' ' || keyword_text)) stored
);
create index if not exists mars_fts on mars_images using gin (fts);

-- ---------- Station 5: knowledge graph ----------
create table if not exists kg_nodes (
  id          text primary key,     -- e.g. 'a13:aquarius', 'planet:TRAPPIST-1 e'
  label       text not null,
  aliases     text[] not null default '{}', -- other words for it ("co2", "lunar module")
  kind        text not null,        -- person, spacecraft, system, event, decision, planet, star, facility, method, topic, paper, place, rover
  station     text not null,        -- mission-control, mars, starship, planet-lab, bridge
  description text not null default '',
  weight      int not null default 1,
  evidence    jsonb not null default '[]',  -- [{"type": "chunk"|"planet"|"paper"|"image", "id": ...}]
  embedding   vector(384)
);
create table if not exists kg_edges (
  src       text not null references kg_nodes(id) on delete cascade,
  dst       text not null references kg_nodes(id) on delete cascade,
  relation  text not null,
  weight    real not null default 1,
  evidence  jsonb not null default '[]',
  primary key (src, dst, relation)
);
create index if not exists kg_edges_dst on kg_edges (dst);
alter table kg_nodes add column if not exists aliases text[] not null default '{}';

-- ---------- search functions ----------

-- hybrid search over paper abstracts (meaning + exact words, fused with RRF)
create or replace function paper_search(
  query_embedding vector(384),
  keyword_query text,
  match_count int default 20,
  rrf_k int default 50
) returns table (id text, title text, abstract text, authors text[], published date, url text, mentions text[], similarity float, score float)
language sql stable as $$
  with sem as (
    select p.id, row_number() over (order by p.embedding <=> query_embedding) as r, 1 - (p.embedding <=> query_embedding) as sim
    from papers p where p.embedding is not null
    order by p.embedding <=> query_embedding limit match_count * 2
  ),
  kw as (
    select p.id, row_number() over (order by ts_rank_cd(p.fts, to_tsquery('english', keyword_query)) desc) as r
    from papers p
    where keyword_query <> '' and p.fts @@ to_tsquery('english', keyword_query)
    order by ts_rank_cd(p.fts, to_tsquery('english', keyword_query)) desc limit match_count * 2
  )
  select p.id, p.title, p.abstract, p.authors, p.published, p.url, p.mentions, sem.sim,
         coalesce(1.0 / (rrf_k + sem.r), 0) + coalesce(1.0 / (rrf_k + kw.r), 0) as score
  from sem full outer join kw on sem.id = kw.id
  join papers p on p.id = coalesce(sem.id, kw.id)
  order by score desc
  limit match_count;
$$;

-- Mars: CLIP picture search (words -> pictures) fused with keyword search on the captions
create or replace function mars_search(
  query_clip vector(512),
  keyword_query text,
  match_count int default 24,
  rrf_k int default 50
) returns table (nasa_id text, title text, description text, date_created date, center text, keywords text[], thumb_url text, page_url text, similarity float, score float)
language sql stable as $$
  with sem as (
    select m.nasa_id, row_number() over (order by m.clip <=> query_clip) as r, 1 - (m.clip <=> query_clip) as sim
    from mars_images m where m.clip is not null
    order by m.clip <=> query_clip limit match_count * 2
  ),
  kw as (
    select m.nasa_id, row_number() over (order by ts_rank_cd(m.fts, to_tsquery('english', keyword_query)) desc) as r
    from mars_images m
    where keyword_query <> '' and m.fts @@ to_tsquery('english', keyword_query)
    order by ts_rank_cd(m.fts, to_tsquery('english', keyword_query)) desc limit match_count * 2
  )
  select m.nasa_id, m.title, m.description, m.date_created, m.center, m.keywords, m.thumb_url, m.page_url, sem.sim,
         coalesce(1.0 / (rrf_k + sem.r), 0) + coalesce(0.6 / (rrf_k + kw.r), 0) as score
  from sem full outer join kw on sem.nasa_id = kw.nasa_id
  join mars_images m on m.nasa_id = coalesce(sem.nasa_id, kw.nasa_id)
  order by score desc
  limit match_count;
$$;

-- Row level security on: the public API keys can read nothing; only the backend's
-- direct database connection (the postgres role) can read and write.
alter table planets enable row level security;
alter table papers enable row level security;
alter table mars_images enable row level security;
alter table kg_nodes enable row level security;
alter table kg_edges enable row level security;
