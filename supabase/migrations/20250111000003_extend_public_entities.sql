-- Add missing fields to public.entities table for Affinity sync
-- This extends the existing entities table with all the fields needed for Affinity integration

-- Add Affinity-specific fields
ALTER TABLE entities ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('organization', 'person', 'fund', 'deal'));
ALTER TABLE entities ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS pipeline_stage text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS fund text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS taxonomy text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS valuation_amount numeric;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS investment_amount numeric;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS year_founded integer;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS employee_count integer;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS location_city text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS location_country text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS urgency text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS series text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS founder_gender text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS pass_lost_reason text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS sourced_by text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS notion_page text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS related_deals text[];
ALTER TABLE entities ADD COLUMN IF NOT EXISTS apollo_taxonomy text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS brief_description text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS source text DEFAULT 'affinity_api_sync';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS affinity_org_id bigint;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS affinity_person_id bigint;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS linkedin_url text;

-- Add enrichment fields
ALTER TABLE entities ADD COLUMN IF NOT EXISTS enrichment_data jsonb DEFAULT '{}';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS employment_history jsonb DEFAULT '[]';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS publications jsonb DEFAULT '[]';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS areas_of_expertise text[] DEFAULT '{}';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS enriched boolean DEFAULT false;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS last_enriched_at timestamp with time zone;

-- Add embedding field
ALTER TABLE entities ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_domain ON entities(domain);
CREATE INDEX IF NOT EXISTS idx_entities_industry ON entities(industry);
CREATE INDEX IF NOT EXISTS idx_entities_pipeline_stage ON entities(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_entities_fund ON entities(fund);
CREATE INDEX IF NOT EXISTS idx_entities_affinity_org_id ON entities(affinity_org_id);
CREATE INDEX IF NOT EXISTS idx_entities_affinity_person_id ON entities(affinity_person_id);
CREATE INDEX IF NOT EXISTS idx_entities_source ON entities(source);

-- Create vector similarity index for embeddings
CREATE INDEX IF NOT EXISTS idx_entities_embedding ON entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
