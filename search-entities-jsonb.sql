-- Better approach: Use JSONB for filters to avoid parameter ordering issues
DROP FUNCTION IF EXISTS search_entities(vector, double precision, integer);
DROP FUNCTION IF EXISTS search_entities(vector, float, integer, text[], text[], text[], text[], timestamp, timestamp);

CREATE OR REPLACE FUNCTION search_entities_filtered(
  query_embedding vector(2000),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20,
  filters jsonb DEFAULT '{}'::jsonb
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
DECLARE
  filter_countries text[];
  filter_industries text[];
  filter_types text[];
  filter_taxonomy text[];
  date_start timestamp;
  date_end timestamp;
BEGIN
  -- Extract filters from JSONB
  filter_countries := COALESCE((filters->>'countries')::jsonb::text[], NULL);
  filter_industries := COALESCE((filters->>'industries')::jsonb::text[], NULL);
  filter_types := COALESCE((filters->>'types')::jsonb::text[], NULL);
  filter_taxonomy := COALESCE((filters->>'taxonomy')::jsonb::text[], NULL);
  date_start := COALESCE((filters->>'dateStart')::timestamp, NULL);
  date_end := COALESCE((filters->>'dateEnd')::timestamp, NULL);

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
    AND (filter_taxonomy IS NULL OR e.taxonomy && filter_taxonomy)
    AND (date_start IS NULL OR e.updated_at >= date_start)
    AND (date_end IS NULL OR e.updated_at <= date_end)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
