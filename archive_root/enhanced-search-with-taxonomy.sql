-- Enhanced search function with filters INCLUDING TAXONOMY
DROP FUNCTION IF EXISTS search_entities(vector, double precision, integer);

CREATE OR REPLACE FUNCTION search_entities(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20,
  filter_countries text[] DEFAULT NULL,
  filter_industries text[] DEFAULT NULL,
  filter_types text[] DEFAULT NULL,
  filter_taxonomy text[] DEFAULT NULL,
  date_start timestamp DEFAULT NULL,
  date_end timestamp DEFAULT NULL
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
  importance numeric,
  location_country text,
  location_city text,
  updated_at timestamp
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
    e.importance,
    e.location_country,
    e.location_city,
    e.updated_at
  FROM graph.entities e
  WHERE e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
    AND (filter_countries IS NULL OR e.location_country = ANY(filter_countries))
    AND (filter_industries IS NULL OR e.industry = ANY(filter_industries))
    AND (filter_types IS NULL OR e.type = ANY(filter_types))
    AND (filter_taxonomy IS NULL OR e.taxonomy && filter_taxonomy)  -- Array overlap operator
    AND (date_start IS NULL OR e.updated_at >= date_start)
    AND (date_end IS NULL OR e.updated_at <= date_end)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
