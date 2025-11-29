-- Create function for vector similarity search on entities
-- This function enables semantic search using pgvector

CREATE OR REPLACE FUNCTION graph.match_entities(
  query_embedding vector(1536),
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

-- Create function for vector similarity search on notes
CREATE OR REPLACE FUNCTION graph.match_notes(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  entity_id uuid,
  latest_summary text,
  notes_count int,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
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

-- Create function for vector similarity search on files
CREATE OR REPLACE FUNCTION graph.match_files(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON graph.entities 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_notes_embedding ON graph.entity_notes_rollup 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_files_embedding ON graph.affinity_files 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create additional indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_entities_type_internal ON graph.entities (type, is_internal);
CREATE INDEX IF NOT EXISTS idx_entities_pipeline_stage ON graph.entities (pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_entities_fund ON graph.entities (fund);
CREATE INDEX IF NOT EXISTS idx_entities_industry ON graph.entities (industry);
CREATE INDEX IF NOT EXISTS idx_entities_portfolio ON graph.entities (is_portfolio);
CREATE INDEX IF NOT EXISTS idx_entities_pipeline ON graph.entities (is_pipeline);

-- Grant permissions
GRANT EXECUTE ON FUNCTION graph.match_entities TO authenticated;
GRANT EXECUTE ON FUNCTION graph.match_notes TO authenticated;
GRANT EXECUTE ON FUNCTION graph.match_files TO authenticated;
