-- Drop old function and create new one with correct types
DROP FUNCTION IF EXISTS search_entities(vector, double precision, integer);

CREATE OR REPLACE FUNCTION search_entities(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  similarity float,
  domain text,
  industry text,
  pipeline_stage text,
  taxonomy text,
  ai_summary text,
  importance float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.type,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.domain,
    e.industry,
    e.pipeline_stage,
    e.taxonomy,
    e.ai_summary,
    e.importance
  FROM graph.entities e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
