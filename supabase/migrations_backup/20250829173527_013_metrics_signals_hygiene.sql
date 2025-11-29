
-- Flexible metrics already assumed as (org_id, company_id, name, value, unit, period, created_at, source)
-- Add audit log and pending queue for human-in-the-loop approvals
create table if not exists metric_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  old_value numeric,
  new_value numeric,
  unit text,
  period text,
  source text,
  actor uuid, -- profiles.id
  approved boolean default true,
  created_at timestamptz default now()
);
alter table metric_audit enable row level security;
create policy metric_audit_rw on metric_audit for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

create table if not exists metric_pending (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  value numeric,
  unit text,
  period text,
  source text,
  evidence jsonb, -- pointer to artifact/email/deck
  created_at timestamptz default now(),
  created_by uuid
);
alter table metric_pending enable row level security;
create policy metric_pending_rw on metric_pending for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

-- Company signals table (Milestone, Risk, Hiring, Competitor, Reg/Legal, Customer)
create table if not exists company_signals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  type text not null,
  title text not null,
  details text,
  date date,
  evidence jsonb default '[]',
  created_at timestamptz default now()
);
create index if not exists csig_org_company_idx on company_signals(org_id, company_id, date);
alter table company_signals enable row level security;
create policy company_signals_rw on company_signals for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

-- Hygiene helper columns on contacts (if not already present)
alter table if exists contacts add column if not exists normalized_email text;
update contacts set normalized_email = lower(email) where email is not null and normalized_email is null;
create index if not exists contacts_norm_email_idx on contacts(org_id, normalized_email);

-- Optional: Affinity linkage fields
alter table if exists contacts add column if not exists affinity_person_id text;
alter table if exists companies add column if not exists affinity_org_id text;
