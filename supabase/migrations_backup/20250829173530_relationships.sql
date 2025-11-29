
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  from_contact uuid references contacts(id) on delete cascade,
  to_contact uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  strength numeric, -- 0 to 1 composite score
  recency_score numeric,
  frequency_score numeric,
  last_interaction timestamptz,
  source text, -- "email","meeting","slack","artifact"
  created_at timestamptz default now()
);
create index if not exists rel_org_idx on relationships(org_id, company_id);
alter table relationships enable row level security;
create policy rel_rw on relationships for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
