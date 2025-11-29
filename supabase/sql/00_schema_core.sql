
-- Simple user profiles (no org requirement)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  created_at timestamptz default now()
);

-- Core entities (no org requirement)
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  affinity_org_id text,
  website text,
  created_at timestamptz default now()
);
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  affinity_person_id text,
  company_id uuid references companies(id),
  created_at timestamptz default now()
);

-- Artifacts (no org requirement)
create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  source_url text,
  storage_path text,
  title text,
  company_id uuid references companies(id),
  contact_id uuid references contacts(id),
  created_by uuid,
  created_at timestamptz default now()
);

-- Jobs (no org requirement)
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null default 'queued',
  payload jsonb,
  result jsonb,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Metrics (no org requirement)
create table if not exists metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  period daterange,
  value numeric,
  source_artifact uuid references artifacts(id),
  created_at timestamptz default now()
);

-- Embeddings (no org requirement)
create extension if not exists vector;
create table if not exists embeddings (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid references artifacts(id),
  chunk text not null,
  vector vector(1536),
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists embeddings_org_idx on embeddings(org_id);
