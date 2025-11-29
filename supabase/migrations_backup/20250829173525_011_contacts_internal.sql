
alter table if exists contacts add column if not exists is_internal boolean not null default false;
create index if not exists contacts_internal_idx on contacts(org_id, is_internal);
