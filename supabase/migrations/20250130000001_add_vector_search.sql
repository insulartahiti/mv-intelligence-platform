-- Add vector similarity search function
CREATE OR REPLACE FUNCTION match_entities(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  domain text,
  industry text,
  pipeline_stage text,
  fund text,
  brief_description text,
  similarity_score float,
  linkedin_first_degree boolean,
  internal_owner boolean,
  strength_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.name,
    e.type,
    e.domain,
    e.industry,
    e.pipeline_stage,
    e.fund,
    e.brief_description,
    1 - (e.embedding <=> query_embedding) as similarity_score,
    e.linkedin_first_degree,
    e.internal_owner,
    COALESCE(
      (SELECT AVG(ed.strength_score) 
       FROM graph.edges ed 
       WHERE ed.source = e.id OR ed.target = e.id), 
      0.5
    ) as strength_score
  FROM graph.entities e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS entities_embedding_idx ON graph.entities 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Add function to search files by similarity
CREATE OR REPLACE FUNCTION match_files(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  name text,
  url text,
  size_bytes bigint,
  organization_id bigint,
  person_id bigint,
  ai_summary text,
  similarity_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id,
    f.name,
    f.url,
    f.size_bytes,
    f.organization_id,
    f.person_id,
    f.ai_summary,
    1 - (f.embedding <=> query_embedding) as similarity_score
  FROM graph.affinity_files f
  WHERE f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for file vector similarity search
CREATE INDEX IF NOT EXISTS affinity_files_embedding_idx ON graph.affinity_files 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 50);

-- Add function to search notes by similarity
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  entity_id uuid,
  latest_summary text,
  notes_count int,
  similarity_score float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.entity_id,
    n.latest_summary,
    n.notes_count,
    1 - (n.embedding <=> query_embedding) as similarity_score
  FROM graph.entity_notes_rollup n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for notes vector similarity search
CREATE INDEX IF NOT EXISTS entity_notes_rollup_embedding_idx ON graph.entity_notes_rollup 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 50);
