
create or replace function news_for_company(p_company_id uuid)
returns setof news_items
language sql stable as $$
  with target as (select c.id, c.name, coalesce(c.domain,'') as domain from companies c where c.id = p_company_id)
  select n.*
  from news_items n
  join company_news_links l on l.news_id = n.id
  where l.company_id = p_company_id
  union
  select n.*
  from news_items n, target t
  where (n.title ilike '%'||t.name||'%' or n.content ilike '%'||t.name||'%' or n.content ilike '%'||t.domain||'%')
  order by published_at desc nulls last
  limit 100;
$$;
