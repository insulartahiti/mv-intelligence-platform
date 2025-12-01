
create table if not exists public.allowed_users (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  name text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.allowed_users enable row level security;

-- Create policy to allow read access to authenticated users (or public for login check)
-- For login check, we might need a function or allow public read if email is known.
-- Safer: Use a secure RPC or server-side check. API route uses service role key, so RLS doesn't block it.

-- Add index
create index if not exists allowed_users_email_idx on public.allowed_users (email);

