-- Fix semantic search functions to remove non-existent column references
-- This migration fixes the match_entities function that references linkedin_first_degree

-- Fix match_entities function to remove linkedin_first_degree reference
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

-- Also fix match_notes function if it has similar issues
CREATE OR REPLACE FUNCTION graph.match_notes(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  content text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    n.id,
    n.entity_id,
    n.content,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM graph.entity_notes_rollup n
  WHERE n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Fix match_files function if it has similar issues
CREATE OR REPLACE FUNCTION graph.match_files(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  entity_id uuid,
  filename text,
  content text,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    f.id,
    f.entity_id,
    f.filename,
    f.content,
    1 - (f.embedding <=> query_embedding) AS similarity
  FROM graph.affinity_files f
  WHERE f.embedding IS NOT NULL
    AND 1 - (f.embedding <=> query_embedding) > match_threshold
  ORDER BY f.embedding <=> query_embedding
  LIMIT match_count;
$$;
