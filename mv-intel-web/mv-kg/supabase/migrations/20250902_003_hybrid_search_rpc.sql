-- Hybrid chunk search (vector + trigram)
create or replace function hybrid_chunk_search(q_embed vector(1536), q_text text, k int default 20)
returns table (
  chunk_id uuid,
  text text,
  artifact_id uuid,
  title text,
  source_type text,
  source_url text,
  vec_score float,
  txt_sim float
)
language sql
stable as $$
  with ranked as (
    select
      c.id as chunk_id,
      c.text,
      c.artifact_id,
      a.title,
      a.source_type,
      a.source_url,
      1 - (c.embedding <=> q_embed) as vec_score,
      greatest(similarity(c.text, q_text), similarity(coalesce(a.title,''), q_text)) as txt_sim
    from chunks c
    join artifacts a on a.id = c.artifact_id
    where c.embedding is not null
    order by (0.7 * (1 - (c.embedding <=> q_embed)) + 0.3 * greatest(similarity(c.text, q_text), similarity(coalesce(a.title,''), q_text))) desc
    limit k
  )
  select * from ranked;
$$;
