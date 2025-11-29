
-- Events table for Week Ahead
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  attendees jsonb, -- [{name,email}]
  source text,     -- google|outlook|manual
  created_at timestamptz default now()
);
alter table events enable row level security;
create policy events_rw on events for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);

-- News items table for recap
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  source text,
  url text,
  title text,
  content text,
  published_at timestamptz,
  companies text[],  -- naive tags
  created_at timestamptz default now()
);
alter table news_items enable row level security;
create policy news_rw on news_items for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
