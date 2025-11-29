-- Simplified MV Intelligence Schema (No Multi-Org Support)
-- Focus on core functionality for testing

-- User profiles (simple)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  created_at timestamptz default now()
);

-- Companies (no org requirement)
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  affinity_org_id text,
  website text,
  created_at timestamptz default now()
);

-- Contacts (no org requirement)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  affinity_person_id text,
  company_id uuid references companies(id),
  created_at timestamptz default now()
);

-- Artifacts (decks, no org requirement)
create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  source_url text,
  storage_path text,
  title text,
  company_id uuid references companies(id),
  contact_id uuid references contacts(id),
  created_by uuid,
  status text default 'NEW',
  slide_count int,
  pdf_path text,
  created_at timestamptz default now()
);

-- Slides (no org requirement)
create table if not exists slides (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts(id) on delete cascade,
  slide_index int not null,
  storage_path text,
  width_px int,
  height_px int,
  created_at timestamptz default now()
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

-- Create indexes
create unique index if not exists slides_unique on slides(artifact_id, slide_index);
create index if not exists artifacts_company_idx on artifacts(company_id);
create index if not exists metrics_company_idx on metrics(company_id);

-- Insert test data
INSERT INTO profiles (id, email, full_name) VALUES 
  ('550e8400-e29b-41d4-a716-446655440001', 'test@example.com', 'Test User')
ON CONFLICT (id) DO NOTHING;

INSERT INTO companies (id, name, affinity_org_id) VALUES 
  ('550e8400-e29b-41d4-a716-446655440002', 'Test Company', '12345')
ON CONFLICT (id) DO NOTHING;











