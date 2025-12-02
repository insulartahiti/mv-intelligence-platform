-- Ensure storage buckets exist and policies are correct
-- This migration is idempotent and repairs missing buckets

-- 1. Financial Docs Bucket
insert into storage.buckets (id, name, public) 
values ('financial-docs', 'financial-docs', false)
on conflict (id) do nothing;

-- 2. Financial Snippets Bucket
insert into storage.buckets (id, name, public) 
values ('financial-snippets', 'financial-snippets', false)
on conflict (id) do nothing;

-- 3. Repair/Ensure RLS Policies
-- Drop existing policies to ensure clean state
drop policy if exists "Authenticated users can upload financial docs" on storage.objects;
drop policy if exists "Authenticated users can read financial docs" on storage.objects;

-- Recreate policies covering BOTH buckets
create policy "Authenticated users can upload financial docs"
on storage.objects for insert
to authenticated
with check ( bucket_id in ('financial-docs', 'financial-snippets') );

create policy "Authenticated users can read financial docs"
on storage.objects for select
to authenticated
using ( bucket_id in ('financial-docs', 'financial-snippets') );


