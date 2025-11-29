
-- Link artifacts to companies and map news to companies explicitly
alter table if exists artifacts add column if not exists company_id uuid references companies(id) on delete set null;

alter table if exists companies add column if not exists affinity_org_id integer;

create table if not exists company_news_links (
  company_id uuid references companies(id) on delete cascade,
  news_id uuid references news_items(id) on delete cascade,
  linked_at timestamptz default now(),
  primary key (company_id, news_id)
);

alter table company_news_links enable row level security;
create policy company_news_rw on company_news_links for all using (
  company_id in (select id from companies where org_id = (select org_id from profiles where id = auth.uid()))
) with check (
  company_id in (select id from companies where org_id = (select org_id from profiles where id = auth.uid()))
);
