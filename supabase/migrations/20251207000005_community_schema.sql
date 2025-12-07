-- Suggestions System
create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'implemented')),
  ai_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS for suggestions
alter table suggestions enable row level security;

-- Policies for suggestions
create policy "Suggestions are viewable by everyone" 
  on suggestions for select 
  using (true);

create policy "Authenticated users can create suggestions" 
  on suggestions for insert 
  with check (auth.role() = 'authenticated');

create policy "Users can update their own suggestions" 
  on suggestions for update 
  using (auth.uid() = user_id);

-- Suggestion Votes
create table if not exists suggestion_votes (
  suggestion_id uuid references suggestions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (suggestion_id, user_id)
);

-- Enable RLS for votes
alter table suggestion_votes enable row level security;

-- Policies for votes
create policy "Votes are viewable by everyone" 
  on suggestion_votes for select 
  using (true);

create policy "Authenticated users can vote" 
  on suggestion_votes for insert 
  with check (auth.role() = 'authenticated');

create policy "Users can remove their own votes" 
  on suggestion_votes for delete 
  using (auth.uid() = user_id);

-- Issue Reporting System
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  description text not null,
  path text,
  screenshot_url text,
  ai_summary text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'wont_fix')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS for issues
alter table issues enable row level security;

-- Policies for issues
create policy "Users can view their own issues" 
  on issues for select 
  using (auth.uid() = user_id);

create policy "Admins can view all issues" 
  on issues for select 
  using (
    exists (
      select 1 from allowed_users 
      where email = auth.jwt() ->> 'email'
    )
  );

create policy "Authenticated users can create issues" 
  on issues for insert 
  with check (auth.role() = 'authenticated');

create policy "Admins can update issues" 
  on issues for update 
  using (
    exists (
      select 1 from allowed_users 
      where email = auth.jwt() ->> 'email'
    )
  );

-- Storage bucket for issue screenshots
insert into storage.buckets (id, name, public)
values ('issue-screenshots', 'issue-screenshots', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Anyone can upload issue screenshots"
  on storage.objects for insert
  with check ( bucket_id = 'issue-screenshots' and auth.role() = 'authenticated' );

create policy "Anyone can view issue screenshots"
  on storage.objects for select
  using ( bucket_id = 'issue-screenshots' );
