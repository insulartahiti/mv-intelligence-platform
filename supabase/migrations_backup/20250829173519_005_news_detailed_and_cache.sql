
-- Cache table for company opportunities
create table if not exists company_opportunities_cache (
  company_id uuid primary key references companies(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  refreshed_at timestamptz not null default now()
);

alter table company_opportunities_cache enable row level security;
create policy opp_cache_rw on company_opportunities_cache for all using (
  company_id in (select id from companies where org_id = (select org_id from profiles where id = auth.uid()))
) with check (
  company_id in (select id from companies where org_id = (select org_id from profiles where id = auth.uid()))
);

-- Detailed news function with linked flag
create or replace function news_for_company_detailed(p_company_id uuid)
returns table (
  id uuid,
  title text,
  url text,
  source text,
  content text,
  published_at timestamptz,
  linked boolean
) language sql stable as $$
  with target as (
    select c.id, c.name, coalesce(c.domain,'') as domain, c.org_id
    from companies c
    where c.id = p_company_id
  ),
  explicit as (
    select n.id, n.title, n.url, n.source, n.content, n.published_at, true as linked
    from news_items n
    join company_news_links l on l.news_id = n.id
    where l.company_id = p_company_id
  ),
  heuristic as (
    select n.id, n.title, n.url, n.source, n.content, n.published_at, false as linked
    from news_items n, target t
    where (n.title ilike '%'||t.name||'%' or n.content ilike '%'||t.name||'%' or n.content ilike '%'||t.domain||'%')
      and not exists (select 1 from company_news_links l where l.news_id = n.id and l.company_id = p_company_id)
  )
  select * from explicit
  union
  select * from heuristic
  order by published_at desc nulls last
  limit 200;
$$;
