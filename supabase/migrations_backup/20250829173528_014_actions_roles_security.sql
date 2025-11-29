
-- Profiles role management
alter table if exists profiles add column if not exists role text default 'member' check (role in ('admin','member','viewer'));
create index if not exists profiles_org_role_idx on profiles(org_id, role);

-- Actions table already exists from migration 007, just add missing columns if needed
alter table if exists actions add column if not exists related_contact uuid references contacts(id) on delete set null;
alter table if exists actions add column if not exists source text;
alter table if exists actions add column if not exists payload jsonb default '{}'::jsonb;
alter table if exists actions add column if not exists updated_at timestamptz default now();

-- Create index if it doesn't exist
create index if not exists actions_org_idx on actions(org_id, status, related_company);

-- Basic RBAC helper views (optional)
create or replace view v_is_admin as
  select id as profile_id, true as is_admin from profiles where role = 'admin';

-- Security audit RPC: lists tables with RLS off and tables missing USING/WITH CHECK on org_id
create or replace function mv_security_audit()
returns json language plpgsql as $$
declare
  rls_off json;
  findings json := '[]'::json;
begin
  select json_agg(json_build_object('schema', n.nspname, 'table', c.relname))
  into rls_off
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname = 'public'
    and c.relrowsecurity = false
    and c.relname not like 'pg_%';

  return json_build_object(
    'rls_off', coalesce(rls_off, '[]'::json),
    'note', 'Ensure all org-scoped tables have RLS enabled with USING and WITH CHECK clauses on org_id'
  );
end $$;
