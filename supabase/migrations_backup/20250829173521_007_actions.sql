
create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  details text,
  due_at timestamptz,
  status text not null default 'OPEN', -- OPEN, DONE, ARCHIVED
  related_company uuid references companies(id) on delete set null,
  related_artifact uuid references artifacts(id) on delete set null,
  created_at timestamptz default now(),
  created_by uuid references profiles(id) on delete set null
);
create index if not exists actions_org_status_due_idx on actions(org_id, status, due_at);

alter table actions enable row level security;
create policy actions_rw on actions for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);
