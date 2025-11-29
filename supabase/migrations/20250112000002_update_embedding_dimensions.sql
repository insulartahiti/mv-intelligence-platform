-- Update embedding columns to use 3072 dimensions for text-embedding-3-large
-- This migration updates all embedding columns to match the OpenAI model output

-- Update entities table embedding column
ALTER TABLE graph.entities ALTER COLUMN embedding TYPE vector(3072);

-- Update affinity_files table embedding column  
ALTER TABLE graph.affinity_files ALTER COLUMN embedding TYPE vector(3072);

-- Update entity_notes_rollup table embedding column
ALTER TABLE graph.entity_notes_rollup ALTER COLUMN embedding TYPE vector(3072);

-- Update the match_entities function to use 3072 dimensions
CREATE OR REPLACE FUNCTION graph.match_entities(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  domain text,
  industry text,
  pipeline_stage text,
  fund text,
  taxonomy text,
  is_internal boolean,
  is_portfolio boolean,
  is_pipeline boolean,
  importance numeric,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    e.id,
    e.name,
    e.type,
    e.domain,
    e.industry,
    e.pipeline_stage,
    e.fund,
    e.taxonomy,
    e.is_internal,
    e.is_portfolio,
    e.is_pipeline,
    e.importance,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM graph.entities e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Update the match_notes function to use 3072 dimensions
CREATE OR REPLACE FUNCTION graph.match_notes(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  latest_summary text,
  notes_count int,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    n.id,
    n.entity_id,
    n.latest_summary,
    n.notes_count,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM graph.entity_notes_rollup n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Update the match_files function to use 3072 dimensions
CREATE OR REPLACE FUNCTION graph.match_files(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  name text,
  ai_summary text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    f.id,
    f.entity_id,
    f.name,
    f.ai_summary,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM graph.affinity_files f
  WHERE f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Recreate indexes with correct dimensions
DROP INDEX IF EXISTS idx_entities_embedding;
DROP INDEX IF EXISTS idx_files_embedding;
DROP INDEX IF EXISTS idx_notes_embedding;

CREATE INDEX idx_entities_embedding ON graph.entities 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_files_embedding ON graph.affinity_files 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_notes_embedding ON graph.entity_notes_rollup 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Grant permissions
GRANT EXECUTE ON FUNCTION graph.match_entities TO authenticated;
GRANT EXECUTE ON FUNCTION graph.match_notes TO authenticated;
GRANT EXECUTE ON FUNCTION graph.match_files TO authenticated;
