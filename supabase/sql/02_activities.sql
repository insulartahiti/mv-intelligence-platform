
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  company_id uuid references companies(id),
  contact_id uuid references contacts(id),
  verb text not null,
  artifact_id uuid references artifacts(id),
  meta jsonb,
  at timestamptz default now()
);
alter table activities enable row level security;
create policy activities_rw on activities for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
