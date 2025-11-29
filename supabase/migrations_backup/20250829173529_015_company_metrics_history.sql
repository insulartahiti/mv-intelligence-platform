
-- Company metric history table for dashboard charts
create table if not exists company_metrics_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date,
  value numeric,
  unit text,
  source_artifact uuid references artifacts(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists cmh_company_idx on company_metrics_history(company_id, name, period_start);
alter table company_metrics_history enable row level security;
create policy cmh_rw on company_metrics_history for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
