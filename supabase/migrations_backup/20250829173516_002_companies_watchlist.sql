
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  domain text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists companies_org_idx on companies(org_id);

create table if not exists company_watchlist (
  org_id uuid not null references orgs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  added_at timestamptz default now(),
  primary key (org_id, company_id)
);

alter table companies enable row level security;
alter table company_watchlist enable row level security;

create policy companies_rw on companies for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

create policy watchlist_rw on company_watchlist for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
