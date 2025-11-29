
-- LinkedIn enrichment on contacts
alter table if exists contacts add column if not exists linkedin_id text;
alter table if exists contacts add column if not exists linkedin_url text;
alter table if exists contacts add column if not exists connection_degree int; -- 1,2,3 if available

-- Explicit contact-to-contact connections (e.g., LinkedIn graph)
create table if not exists contact_connections (
  org_id uuid not null references orgs(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  other_contact_id uuid not null references contacts(id) on delete cascade,
  degree int,              -- 1,2,3
  source text default 'linkedin',
  weight numeric default 1,
  updated_at timestamptz default now(),
  primary key (org_id, contact_id, other_contact_id, source)
);
alter table contact_connections enable row level security;
create policy contact_connections_rw on contact_connections for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
create index if not exists cc_contact_idx on contact_connections(org_id, contact_id);
create index if not exists cc_other_idx on contact_connections(org_id, other_contact_id);

-- Optional helper view to surface strongest contacts into a company
create or replace view company_top_contacts as
select
  r.org_id,
  r.company_id,
  r.from_contact as contact_id,
  r.strength,
  r.recency_score,
  r.frequency_score,
  c.name as contact_name,
  c.title as contact_title,
  c.email as contact_email,
  c.tags as contact_tags,
  c.linkedin_url,
  c.connection_degree
from relationships r
join contacts c on c.id = r.from_contact
where r.company_id is not null;
