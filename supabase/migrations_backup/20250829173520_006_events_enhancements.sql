
-- Improve events support for meeting prep
alter table if exists events add column if not exists external_source text;        -- 'google','outlook','zapier'
alter table if exists events add column if not exists external_id text;            -- provider event id
alter table if exists events add column if not exists company_id uuid references companies(id) on delete set null;
create index if not exists events_org_time_idx on events(org_id, starts_at);
