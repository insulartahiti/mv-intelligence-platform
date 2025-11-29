-- Fix vector search by updating match_entities function
-- This migration fixes the match_entities function to remove the linkedin_first_degree reference

-- Drop and recreate the match_entities function
DROP FUNCTION IF EXISTS graph.match_entities(vector, float, int);

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

-- Note: match_notes and match_files functions will be added later
-- when we have proper data in those tables
