
-- Ensure contacts table exists with expected fields
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  email text,
  company_id uuid references companies(id) on delete set null,
  title text,
  tags text[] default '{}',
  last_interaction_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  external_source text,
  external_id text
);
create index if not exists contacts_org_idx on contacts(org_id);
create index if not exists contacts_company_idx on contacts(company_id);
alter table contacts enable row level security;
create policy contacts_rw on contacts for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

-- Relationships graph (contact<->company and contact<->contact edges via company_id or direct co-activity)
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  from_contact uuid references contacts(id) on delete cascade,
  to_contact uuid references contacts(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  strength numeric default 0,        -- overall 0..1
  recency_score numeric default 0,   -- 0..1
  frequency_score numeric default 0, -- 0..1
  last_interaction timestamptz,
  source text, -- 'email','meeting','slack','affinity','manual'
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists rel_org_comp_idx on relationships(org_id, company_id);
create index if not exists rel_org_from_idx on relationships(org_id, from_contact);
create index if not exists rel_org_to_idx on relationships(org_id, to_contact);
alter table relationships enable row level security;
create policy relationships_rw on relationships for all using (
  org_id = (select org_id from profiles where id = auth.uid())
) with check (
  org_id = (select org_id from profiles where id = auth.uid())
);

-- Contact embeddings (reuse same embeddings table if present; else create minimal)
-- Expect a generic embeddings table: id, org_id, artifact_id?, contact_id?, content, metadata, embedding vector
do $$ begin
  perform 1 from information_schema.columns where table_name='embeddings' and column_name='contact_id';
  if not found then
    alter table if exists embeddings add column if not exists contact_id uuid references contacts(id) on delete cascade;
  end if;
end $$;

create index if not exists embeddings_contact_idx on embeddings(contact_id);
