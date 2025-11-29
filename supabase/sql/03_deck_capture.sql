
create table if not exists slides (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts(id) on delete cascade,
  slide_index int not null,
  storage_path text,
  width_px int,
  height_px int,
  created_at timestamptz default now()
);
create unique index if not exists slides_unique on slides(artifact_id, slide_index);
do $$ begin alter table artifacts add column if not exists status text default 'NEW'; exception when duplicate_column then null; end $$;
do $$ begin alter table artifacts add column if not exists slide_count int; exception when duplicate_column then null; end $$;
do $$ begin alter table artifacts add column if not exists pdf_path text; exception when duplicate_column then null; end $$;
-- No RLS for now - simplified auth
