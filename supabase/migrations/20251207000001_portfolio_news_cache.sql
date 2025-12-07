create table if not exists public.portfolio_news_cache (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references graph.entities(id) on delete cascade,
  query_hash text not null,
  news_data jsonb not null,
  updated_at timestamptz default now(),
  unique(company_id, query_hash)
);

-- Add RLS
alter table public.portfolio_news_cache enable row level security;

create policy "Allow read access to all users"
  on public.portfolio_news_cache for select
  using (true);

create policy "Allow write access to authenticated users"
  on public.portfolio_news_cache for insert
  with check (auth.role() = 'authenticated' or auth.role() = 'service_role');

create policy "Allow update access to authenticated users"
  on public.portfolio_news_cache for update
  using (auth.role() = 'authenticated' or auth.role() = 'service_role');
