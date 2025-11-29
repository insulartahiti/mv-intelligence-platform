
-- Requires embeddings table with 'embedding' vector and 'contact_id'
create or replace function match_embeddings_contacts(p_org_id uuid, p_query_embedding vector, p_match_count int)
returns table (contact_id uuid, content text, similarity float)
language sql stable as $$
  select e.contact_id, e.content, 1 - (e.embedding <=> p_query_embedding) as similarity
  from embeddings e
  where e.contact_id is not null
    and e.org_id = p_org_id
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$$;
