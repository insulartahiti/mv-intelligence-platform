create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_url text,
  external_id text,
  title text,
  raw_text text,
  metadata jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz default now(),
  unique (source_type, external_id)
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts(id) on delete cascade,
  idx int not null,
  text text not null,
  token_count int,
  embedding vector(1536),
  enriched_at timestamptz,
  created_at timestamptz default now(),
  unique (artifact_id, idx)
);
create index if not exists chunks_ivf on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 200);

create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('company','person','fund','org','product','topic','event')),
  canonical_name text not null,
  aliases text[] default '{}',
  properties jsonb default '{}'::jsonb,
  ext_ids jsonb default '{}'::jsonb,
  importance numeric default 0,
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (kind, lower(canonical_name))
);
create index if not exists entities_name_trgm on entities using gin (canonical_name gin_trgm_ops);
create index if not exists entities_aliases on entities using gin (aliases);

create table if not exists mentions (
  id uuid primary key default gen_random_uuid(),
  chunk_id uuid not null references chunks(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  span int4range,
  confidence numeric,
  created_at timestamptz default now()
);

create table if not exists relations (
  id uuid primary key default gen_random_uuid(),
  subj uuid not null references entities(id) on delete cascade,
  pred text not null,
  obj uuid not null references entities(id) on delete cascade,
  weight numeric default 0.5,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  props jsonb default '{}'::jsonb,
  evidence jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  unique (subj, pred, obj)
);

-- RLS
alter table artifacts enable row level security;
alter table chunks enable row level security;
alter table entities enable row level security;
alter table mentions enable row level security;
alter table relations enable row level security;

create policy artifacts_rw on artifacts for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy chunks_rw on chunks for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy entities_rw on entities for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy mentions_rw on mentions for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy relations_rw on relations for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
