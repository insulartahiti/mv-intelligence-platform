-- MV Intelligence consolidated migration
create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key, -- auth.uid()
  org_id uuid references orgs(id) on delete set null,
  email text unique,
  full_name text,
  created_at timestamptz default now()
);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,
  owner_id uuid references profiles(id) on delete set null,
  source text,
  source_url text,
  title text,
  summary jsonb,
  pdf_url text,
  affinity_push_status text default 'PENDING',
  affinity_external_ids jsonb,
  dedupe_key text unique,
  created_at timestamptz default now()
);

create table if not exists slides (
  id bigserial primary key,
  artifact_id uuid references artifacts(id) on delete cascade,
  slide_index int not null,
  image_url text not null,
  width_px int,
  height_px int,
  ocr_text text,
  created_at timestamptz default now()
);

create table if not exists embeddings (
  id bigserial primary key,
  org_id uuid references orgs(id) on delete cascade,
  artifact_id uuid references artifacts(id) on delete cascade,
  chunk_id text,
  content text not null,
  metadata jsonb,
  embedding vector(1536) not null,
  created_at timestamptz default now()
);

create table if not exists metrics (
  id bigserial primary key,
  org_id uuid references orgs(id) on delete cascade,
  company_id uuid,
  name text not null,
  value numeric,
  unit text,
  period text,
  source_artifact uuid references artifacts(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists activities (
  id bigserial primary key,
  org_id uuid references orgs(id) on delete cascade,
  artifact_id uuid references artifacts(id) on delete set null,
  verb text not null,
  meta jsonb,
  created_at timestamptz default now()
);

-- Events and news for planners/recap
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  attendees jsonb,
  source text,
  created_at timestamptz default now()
);

create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  source text,
  url text,
  title text,
  content text,
  published_at timestamptz,
  companies text[],
  created_at timestamptz default now()
);

-- Vector index
create index if not exists embeddings_org_id_idx on embeddings(org_id);
create index if not exists embeddings_hnsw on embeddings using hnsw (embedding vector_cosine_ops);

-- RPC for search
create or replace function match_embeddings(
  p_org_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 10
)
returns table (
  id bigint,
  artifact_id uuid,
  chunk_id text,
  content text,
  metadata jsonb,
  similarity float
) language sql stable as $$
  select e.id, e.artifact_id, e.chunk_id, e.content, e.metadata,
         1 - (e.embedding <=> p_query_embedding) as similarity  
  from embeddings e                                             
  where e.org_id = p_org_id                                     
  order by e.embedding <=> p_query_embedding                    
  limit p_match_count;                                          
$$;

-- RLS
alter table profiles enable row level security;
alter table artifacts enable row level security;
alter table slides enable row level security;
alter table embeddings enable row level security;
alter table metrics enable row level security;
alter table activities enable row level security;
alter table events enable row level security;
alter table news_items enable row level security;

-- Policies: org-scoped read/write
create policy profiles_self on profiles for select using (id = auth.uid());

create policy artifacts_org_read on artifacts for select using (
  org_id = (select org_id from profiles where id = auth.uid())
);
create policy artifacts_org_insert on artifacts for insert with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
create policy artifacts_org_update on artifacts for update using (
  org_id = (select org_id from profiles where id = auth.uid())
);

create policy slides_org_read on slides for select using (
  artifact_id in (select id from artifacts where org_id = (select org_id from profiles where id = auth.uid()))
);
create policy slides_org_insert on slides for insert with check (
  artifact_id in (select id from artifacts where org_id = (select org_id from profiles where id = auth.uid()))
);

create policy embeddings_org_read on embeddings for select using (
  org_id = (select org_id from profiles where id = auth.uid())
);
create policy embeddings_org_insert on embeddings for insert with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

create policy metrics_org_rw on metrics for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

create policy activities_org_rw on activities for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

create policy events_org_rw on events for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

create policy news_org_rw on news_items for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
