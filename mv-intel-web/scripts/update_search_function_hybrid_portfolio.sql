-- Update search function to support Hybrid Search (Name Match) and Portfolio Filtering
DROP FUNCTION IF EXISTS search_entities_filtered(vector, float, int, jsonb);

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
  updated_at timestamp with time zone,
  business_analysis jsonb,
  enrichment_source text,
  is_portfolio boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  filter_countries text[];
  filter_industries text[];
  filter_types text[];
  filter_taxonomy text[];
  filter_seniority text[];
  filter_is_portfolio boolean;
  query_text text;
  date_start timestamp;
  date_end timestamp;
BEGIN
  -- Extract filters from JSONB
  
  -- Countries
  IF filters ? 'countries' THEN
    SELECT array_agg(elem::text) INTO filter_countries
    FROM jsonb_array_elements_text(filters->'countries') elem;
  END IF;

  -- Industries
  IF filters ? 'industries' THEN
    SELECT array_agg(elem::text) INTO filter_industries
    FROM jsonb_array_elements_text(filters->'industries') elem;
  END IF;

  -- Types
  IF filters ? 'types' THEN
    SELECT array_agg(elem::text) INTO filter_types
    FROM jsonb_array_elements_text(filters->'types') elem;
  END IF;

  -- Taxonomy
  IF filters ? 'taxonomy' THEN
    SELECT array_agg(elem::text) INTO filter_taxonomy
    FROM jsonb_array_elements_text(filters->'taxonomy') elem;
  END IF;

  -- Seniority
  IF filters ? 'seniority' THEN
    SELECT array_agg(elem::text) INTO filter_seniority
    FROM jsonb_array_elements_text(filters->'seniority') elem;
  END IF;

  -- Portfolio Status
  IF filters ? 'isPortfolio' THEN
    filter_is_portfolio := (filters->>'isPortfolio')::boolean;
  END IF;

  -- Query Text (for Name Matching)
  IF filters ? 'queryText' THEN
    query_text := filters->>'queryText';
  END IF;

  -- Dates
  IF filters ? 'dateStart' THEN
    date_start := (filters->>'dateStart')::timestamp;
    date_end := (filters->>'dateEnd')::timestamp; -- Assuming logic usually sets both if set
  END IF;
  -- Handle dateEnd if checked separately or overwriting
  IF filters ? 'dateEnd' THEN
    date_end := (filters->>'dateEnd')::timestamp;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.type,
    CASE 
      -- Exact name match gets highest score (1.0)
      WHEN query_text IS NOT NULL AND lower(e.name) = lower(query_text) THEN 1.0
      -- Partial name match gets high score (0.9)
      WHEN query_text IS NOT NULL AND length(query_text) > 3 AND e.name ILIKE '%' || query_text || '%' THEN 0.9
      -- Vector similarity
      ELSE 1 - (e.embedding <=> query_embedding)
    END as similarity,
    e.domain,
    e.industry,
    e.pipeline_stage,
    e.taxonomy,
    e.ai_summary,
    e.importance,
    e.location_country,
    e.location_city,
    e.updated_at,
    e.business_analysis,
    e.enrichment_source,
    e.is_portfolio
  FROM graph.entities e
  WHERE e.embedding IS NOT NULL
    AND (
      -- Match if:
      -- 1. Vector similarity > threshold
      (1 - (e.embedding <=> query_embedding) > match_threshold)
      OR 
      -- 2. OR Exact/Partial Name Match (if query provided)
      (query_text IS NOT NULL AND (
         lower(e.name) = lower(query_text) OR 
         (length(query_text) > 3 AND e.name ILIKE '%' || query_text || '%')
      ))
    )
    -- Filters
    AND (filter_countries IS NULL OR e.location_country = ANY(filter_countries))
    AND (filter_industries IS NULL OR e.industry = ANY(filter_industries))
    AND (filter_types IS NULL OR e.type = ANY(filter_types))
    AND (filter_taxonomy IS NULL OR e.taxonomy = ANY(filter_taxonomy) OR (e.taxonomy_secondary && filter_taxonomy))
    AND (filter_seniority IS NULL OR e.business_analysis->>'seniority_level' = ANY(filter_seniority))
    AND (filter_is_portfolio IS NULL OR e.is_portfolio = filter_is_portfolio)
    AND (date_start IS NULL OR e.updated_at >= date_start)
    AND (date_end IS NULL OR e.updated_at <= date_end)
  ORDER BY 
    -- Custom sort: Exact matches first, then similarity
    CASE 
      WHEN query_text IS NOT NULL AND lower(e.name) = lower(query_text) THEN 1.0
      WHEN query_text IS NOT NULL AND length(query_text) > 3 AND e.name ILIKE '%' || query_text || '%' THEN 0.9
      ELSE 1 - (e.embedding <=> query_embedding)
    END DESC
  LIMIT match_count;
END;
$$;

