-- Storage Bucket for Audit Snippets (Permanent Retention)
insert into storage.buckets (id, name, public) 
values ('financial-snippets', 'financial-snippets', false)
on conflict (id) do nothing;

-- Update RLS Policies to include financial-snippets
-- Drop existing policies if they don't include snippets (safe to recreate)
drop policy if exists "Authenticated users can upload financial docs" on storage.objects;
drop policy if exists "Authenticated users can read financial docs" on storage.objects;

-- Recreate policies covering both buckets
create policy "Authenticated users can upload financial docs"
on storage.objects for insert
to authenticated
with check ( bucket_id in ('financial-docs', 'financial-snippets') );

create policy "Authenticated users can read financial docs"
on storage.objects for select
to authenticated
using ( bucket_id in ('financial-docs', 'financial-snippets') );

