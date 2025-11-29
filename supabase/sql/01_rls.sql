
-- Enable RLS
alter table organizations enable row level security;
alter table members enable row level security;
alter table companies enable row level security;
alter table contacts enable row level security;
alter table artifacts enable row level security;
alter table jobs enable row level security;
alter table metrics enable row level security;
alter table embeddings enable row level security;

-- Assume JWT includes claim org_id; allow members(org_id) only.
create policy org_read on organizations for select using (true);
create policy members_read on members for select using (auth.uid() = user_id);
create policy members_write on members for insert with check (true);

create policy companies_rw on companies for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
create policy contacts_rw  on contacts  for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
create policy artifacts_rw on artifacts for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
create policy jobs_rw      on jobs      for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
create policy metrics_rw   on metrics   for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
create policy embeddings_rw on embeddings for all using (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid) with check (org_id = (current_setting('request.jwt.claims', true)::jsonb->>'org_id')::uuid);
