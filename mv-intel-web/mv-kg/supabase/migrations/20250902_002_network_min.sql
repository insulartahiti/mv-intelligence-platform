create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  primary_email text,
  emails text[] default '{}',
  title text,
  linkedin_url text,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists contacts_email_unique on contacts(lower(primary_email));

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (lower(name))
);
create unique index if not exists companies_domain_unique on companies(lower(domain));

create table if not exists contact_company_link (
  contact_id uuid not null references contacts(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role text,
  confidence numeric not null default 0.7,
  last_seen_at timestamptz,
  sources jsonb default '[]'::jsonb,
  primary key (contact_id, company_id)
);

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  duration_min int,
  channel text not null check (channel in ('calendar','email','slack','im','intro','call')),
  subject text,
  company_id uuid references companies(id) on delete set null,
  participants uuid[] not null,
  created_at timestamptz default now()
);
create index if not exists interactions_time on interactions(started_at desc);

create table if not exists edges_contact_contact (
  a uuid not null references contacts(id) on delete cascade,
  b uuid not null references contacts(id) on delete cascade,
  weight numeric not null default 0,
  last_seen_at timestamptz,
  channels jsonb default '[]'::jsonb,
  evidence jsonb default '[]'::jsonb,
  updated_at timestamptz default now(),
  primary key (a,b)
);

-- RLS
alter table contacts enable row level security;
alter table companies enable row level security;
alter table contact_company_link enable row level security;
alter table interactions enable row level security;
alter table edges_contact_contact enable row level security;

create policy contacts_rw on contacts for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy companies_rw on companies for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy ccl_rw on contact_company_link for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy interactions_rw on interactions for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy edges_rw on edges_contact_contact for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
