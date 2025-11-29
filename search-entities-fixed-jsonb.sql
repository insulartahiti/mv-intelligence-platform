-- Fixed JSONB extraction for arrays
DROP FUNCTION IF EXISTS search_entities_filtered(vector, float, integer, jsonb);

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
  -- Extract arrays from JSONB properly
  IF filters ? 'countries' THEN
    SELECT array_agg(elem::text) INTO filter_countries
    FROM jsonb_array_elements_text(filters->'countries') elem;
  END IF;
  
  IF filters ? 'industries' THEN
    SELECT array_agg(elem::text) INTO filter_industries
    FROM jsonb_array_elements_text(filters->'industries') elem;
  END IF;
  
  IF filters ? 'types' THEN
    SELECT array_agg(elem::text) INTO filter_types
    FROM jsonb_array_elements_text(filters->'types') elem;
  END IF;
  
  IF filters ? 'taxonomy' THEN
    SELECT array_agg(elem::text) INTO filter_taxonomy
    FROM jsonb_array_elements_text(filters->'taxonomy') elem;
  END IF;
  
  IF filters ? 'dateStart' THEN
    date_start := (filters->>'dateStart')::timestamp;
  END IF;
  
  IF filters ? 'dateEnd' THEN
    date_end := (filters->>'dateEnd')::timestamp;
  END IF;

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
