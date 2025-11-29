-- Enhanced Knowledge Graph Intelligence - Enrichment Overlays
-- Create typed enrichment tables for better query performance and consistency

-- Perplexity enrichment with typed fields
CREATE TABLE graph.perplexity_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES graph.entities(id) ON DELETE CASCADE,
  bio text,
  key_achievements text[],
  expertise_areas text[],
  recent_news jsonb,  -- Still JSONB for varying structure
  company_overview text,
  competitive_landscape jsonb,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(entity_id)
);

-- LinkedIn enrichment with typed fields  
CREATE TABLE graph.linkedin_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES graph.entities(id) ON DELETE CASCADE,
  current_title text,
  current_company text,
  location text,
  connections_count integer,
  mutual_connections text[],
  skills text[],
  endorsements jsonb,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(entity_id)
);

-- Web research enrichment with typed fields
CREATE TABLE graph.web_research_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES graph.entities(id) ON DELETE CASCADE,
  company_description text,
  key_people text[],
  funding_history jsonb,
  recent_acquisitions jsonb,
  market_position text,
  competitive_analysis jsonb,
  news_sentiment jsonb,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(entity_id)
);

-- Create indexes for performance
CREATE INDEX idx_perplexity_enrichment_entity_id ON graph.perplexity_enrichment(entity_id);
CREATE INDEX idx_perplexity_enrichment_expertise ON graph.perplexity_enrichment USING GIN (expertise_areas);
CREATE INDEX idx_perplexity_enrichment_achievements ON graph.perplexity_enrichment USING GIN (key_achievements);

CREATE INDEX idx_linkedin_enrichment_entity_id ON graph.linkedin_enrichment(entity_id);
CREATE INDEX idx_linkedin_enrichment_skills ON graph.linkedin_enrichment USING GIN (skills);
CREATE INDEX idx_linkedin_enrichment_company ON graph.linkedin_enrichment(current_company);

CREATE INDEX idx_web_research_enrichment_entity_id ON graph.web_research_enrichment(entity_id);
CREATE INDEX idx_web_research_enrichment_people ON graph.web_research_enrichment USING GIN (key_people);

-- Add regular columns for common queries (not generated columns due to immutability requirements)
ALTER TABLE graph.entities 
  ADD COLUMN IF NOT EXISTS computed_expertise text[];

ALTER TABLE graph.entities 
  ADD COLUMN IF NOT EXISTS computed_skills text[];

ALTER TABLE graph.entities 
  ADD COLUMN IF NOT EXISTS computed_company text;

-- Create indexes on computed columns
CREATE INDEX IF NOT EXISTS idx_entities_computed_expertise ON graph.entities USING GIN (computed_expertise);
CREATE INDEX IF NOT EXISTS idx_entities_computed_skills ON graph.entities USING GIN (computed_skills);
CREATE INDEX IF NOT EXISTS idx_entities_computed_company ON graph.entities (computed_company);

-- Create function to update computed columns
CREATE OR REPLACE FUNCTION graph.update_computed_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Update computed_expertise
  NEW.computed_expertise = COALESCE(
    (NEW.enrichment_data->'parsed_web_data'->>'expertise_areas')::text[], 
    NEW.areas_of_expertise
  );
  
  -- Update computed_skills
  NEW.computed_skills = (NEW.enrichment_data->'linkedin_data'->>'skills')::text[];
  
  -- Update computed_company
  NEW.computed_company = COALESCE(
    NEW.enrichment_data->'linkedin_data'->>'current_company',
    NEW.enrichment_data->'parsed_web_data'->>'current_employer'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update computed columns
DROP TRIGGER IF EXISTS trigger_update_computed_columns ON graph.entities;
CREATE TRIGGER trigger_update_computed_columns
  BEFORE INSERT OR UPDATE ON graph.entities
  FOR EACH ROW
  EXECUTE FUNCTION graph.update_computed_columns();

-- Update existing rows to populate computed columns
UPDATE graph.entities SET 
  computed_expertise = COALESCE(
    (enrichment_data->'parsed_web_data'->>'expertise_areas')::text[], 
    areas_of_expertise
  ),
  computed_skills = (enrichment_data->'linkedin_data'->>'skills')::text[],
  computed_company = COALESCE(
    enrichment_data->'linkedin_data'->>'current_company',
    enrichment_data->'parsed_web_data'->>'current_employer'
  )
WHERE computed_expertise IS NULL OR computed_skills IS NULL OR computed_company IS NULL;

-- Create view for unified enrichment data
CREATE OR REPLACE VIEW graph.enrichment_unified AS
SELECT 
  e.id,
  e.name,
  e.type,
  -- Perplexity data
  p.bio as perplexity_bio,
  p.key_achievements,
  p.expertise_areas as perplexity_expertise,
  p.recent_news,
  p.company_overview,
  -- LinkedIn data
  l.current_title,
  l.current_company,
  l.location,
  l.connections_count,
  l.mutual_connections,
  l.skills as linkedin_skills,
  -- Web research data
  w.company_description,
  w.key_people,
  w.funding_history,
  w.market_position,
  -- Computed fields
  e.computed_expertise,
  e.computed_skills,
  e.computed_company,
  -- Timestamps
  GREATEST(
    COALESCE(p.last_updated, '1970-01-01'::timestamp),
    COALESCE(l.last_updated, '1970-01-01'::timestamp),
    COALESCE(w.last_updated, '1970-01-01'::timestamp)
  ) as last_enriched_at
FROM graph.entities e
LEFT JOIN graph.perplexity_enrichment p ON e.id = p.entity_id
LEFT JOIN graph.linkedin_enrichment l ON e.id = l.entity_id
LEFT JOIN graph.web_research_enrichment w ON e.id = w.entity_id;

-- Grant permissions
GRANT SELECT ON graph.enrichment_unified TO authenticated;
GRANT ALL ON graph.perplexity_enrichment TO authenticated;
GRANT ALL ON graph.linkedin_enrichment TO authenticated;
GRANT ALL ON graph.web_research_enrichment TO authenticated;
