-- Knowledge Graph Intelligence Platform v2 Schema Migration
-- This migration creates the comprehensive schema for AI-powered knowledge graph

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Clear existing test data
TRUNCATE TABLE graph.entities CASCADE;
TRUNCATE TABLE graph.edges CASCADE;

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS graph.affinity_files CASCADE;
DROP TABLE IF EXISTS graph.entity_notes_rollup CASCADE;
DROP TABLE IF EXISTS graph.linkedin_connections CASCADE;
DROP TABLE IF EXISTS graph.sync_state CASCADE;

-- Enhanced entities table with AI capabilities
ALTER TABLE graph.entities 
ADD COLUMN IF NOT EXISTS embedding vector(1536),
ADD COLUMN IF NOT EXISTS enrichment_data jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS employment_history jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS publications jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS areas_of_expertise text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS affinity_person_id bigint,
ADD COLUMN IF NOT EXISTS affinity_org_id bigint,
ADD COLUMN IF NOT EXISTS linkedin_url text,
ADD COLUMN IF NOT EXISTS enriched boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_enriched_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS pipeline_stage text,
ADD COLUMN IF NOT EXISTS fund text,
ADD COLUMN IF NOT EXISTS taxonomy text,
ADD COLUMN IF NOT EXISTS taxonomy_subcategory text,
ADD COLUMN IF NOT EXISTS valuation_amount numeric,
ADD COLUMN IF NOT EXISTS investment_amount numeric,
ADD COLUMN IF NOT EXISTS year_founded integer,
ADD COLUMN IF NOT EXISTS employee_count integer,
ADD COLUMN IF NOT EXISTS location_city text,
ADD COLUMN IF NOT EXISTS location_country text,
ADD COLUMN IF NOT EXISTS urgency text,
ADD COLUMN IF NOT EXISTS series text,
ADD COLUMN IF NOT EXISTS founder_gender text,
ADD COLUMN IF NOT EXISTS pass_lost_reason text,
ADD COLUMN IF NOT EXISTS sourced_by text,
ADD COLUMN IF NOT EXISTS notion_page text,
ADD COLUMN IF NOT EXISTS related_deals text[],
ADD COLUMN IF NOT EXISTS apollo_taxonomy text,
ADD COLUMN IF NOT EXISTS brief_description text;

-- Enhanced edges table with interaction tracking
ALTER TABLE graph.edges
ADD COLUMN IF NOT EXISTS interaction_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_interaction_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS interaction_summary text,
ADD COLUMN IF NOT EXISTS strength_score float DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS interaction_types text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create affinity_files table for file metadata
CREATE TABLE graph.affinity_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
    affinity_file_id bigint NOT NULL,
    name text NOT NULL,
    url text,
    size_bytes bigint,
    mime_type text,
    ai_summary text,
    embedding vector(1536),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    processed boolean DEFAULT false
);

-- Create entity_notes_rollup table for aggregated notes
CREATE TABLE graph.entity_notes_rollup (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
    latest_summary text,
    notes_count integer DEFAULT 0,
    reminders_count integer DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now(),
    embedding vector(1536),
    UNIQUE(entity_id)
);

-- Create linkedin_connections table
CREATE TABLE graph.linkedin_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_entity_id uuid NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
    linkedin_profile_url text NOT NULL,
    connection_date timestamp with time zone,
    mutual_connections text[] DEFAULT '{}',
    connection_strength text DEFAULT 'medium', -- low, medium, high
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(person_entity_id, linkedin_profile_url)
);

-- Create sync_state table for tracking API sync progress
CREATE TABLE graph.sync_state (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    last_sync_timestamp timestamp with time zone,
    entities_synced integer DEFAULT 0,
    rate_limit_remaining integer DEFAULT 300,
    next_sync_allowed timestamp with time zone DEFAULT now(),
    sync_type text DEFAULT 'incremental', -- full, incremental
    status text DEFAULT 'idle', -- idle, running, error
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Insert initial sync state
INSERT INTO graph.sync_state (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

-- Create indexes for performance
-- CREATE INDEX IF NOT EXISTS idx_entities_embedding ON graph.entities USING ivfflat (embedding vector_cosine_ops);
-- Disabled: ivfflat doesn't support 3072 dimensions, using HNSW instead
CREATE INDEX IF NOT EXISTS idx_entities_type ON graph.entities (type);
CREATE INDEX IF NOT EXISTS idx_entities_pipeline_stage ON graph.entities (pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_entities_fund ON graph.entities (fund);
CREATE INDEX IF NOT EXISTS idx_entities_industry ON graph.entities (industry);
CREATE INDEX IF NOT EXISTS idx_entities_internal_owner ON graph.entities ((metadata->>'internal_owner'));
CREATE INDEX IF NOT EXISTS idx_entities_linkedin_first_degree ON graph.entities (linkedin_first_degree);
CREATE INDEX IF NOT EXISTS idx_entities_affinity_person_id ON graph.entities (affinity_person_id);
CREATE INDEX IF NOT EXISTS idx_entities_affinity_org_id ON graph.entities (affinity_org_id);

CREATE INDEX IF NOT EXISTS idx_edges_strength ON graph.edges (strength_score);
CREATE INDEX IF NOT EXISTS idx_edges_interaction_count ON graph.edges (interaction_count);
CREATE INDEX IF NOT EXISTS idx_edges_last_interaction ON graph.edges (last_interaction_date);
CREATE INDEX IF NOT EXISTS idx_edges_source ON graph.edges (source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON graph.edges (target);

CREATE INDEX IF NOT EXISTS idx_affinity_files_entity_id ON graph.affinity_files (entity_id);
-- CREATE INDEX IF NOT EXISTS idx_affinity_files_embedding ON graph.affinity_files USING ivfflat (embedding vector_cosine_ops);
-- Disabled: ivfflat doesn't support 3072 dimensions, using HNSW instead
CREATE INDEX IF NOT EXISTS idx_affinity_files_processed ON graph.affinity_files (processed);

CREATE INDEX IF NOT EXISTS idx_notes_rollup_entity_id ON graph.entity_notes_rollup (entity_id);
-- CREATE INDEX IF NOT EXISTS idx_notes_rollup_embedding ON graph.entity_notes_rollup USING ivfflat (embedding vector_cosine_ops);
-- Disabled: ivfflat doesn't support 3072 dimensions, using HNSW instead

CREATE INDEX IF NOT EXISTS idx_linkedin_connections_person ON graph.linkedin_connections (person_entity_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON graph.entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_edges_updated_at BEFORE UPDATE ON graph.edges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_affinity_files_updated_at BEFORE UPDATE ON graph.affinity_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_state_updated_at BEFORE UPDATE ON graph.sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to calculate edge strength based on interactions
CREATE OR REPLACE FUNCTION calculate_edge_strength(
    interaction_count integer,
    last_interaction_date timestamp with time zone,
    interaction_types text[]
) RETURNS float AS $$
DECLARE
    base_strength float := 0.1;
    interaction_bonus float := 0.0;
    recency_bonus float := 0.0;
    type_bonus float := 0.0;
    days_since_last_interaction integer;
BEGIN
    -- Base strength from interaction count (logarithmic)
    IF interaction_count > 0 THEN
        interaction_bonus := LEAST(0.4, LN(interaction_count + 1) * 0.1);
    END IF;
    
    -- Recency bonus (more recent = stronger)
    IF last_interaction_date IS NOT NULL THEN
        days_since_last_interaction := EXTRACT(EPOCH FROM (now() - last_interaction_date)) / 86400;
        IF days_since_last_interaction <= 7 THEN
            recency_bonus := 0.3;
        ELSIF days_since_last_interaction <= 30 THEN
            recency_bonus := 0.2;
        ELSIF days_since_last_interaction <= 90 THEN
            recency_bonus := 0.1;
        END IF;
    END IF;
    
    -- Type bonus (meetings and calls are stronger than emails)
    IF 'meeting' = ANY(interaction_types) THEN
        type_bonus := 0.1;
    END IF;
    IF 'call' = ANY(interaction_types) THEN
        type_bonus := type_bonus + 0.05;
    END IF;
    
    RETURN LEAST(1.0, base_strength + interaction_bonus + recency_bonus + type_bonus);
END;
$$ LANGUAGE plpgsql;

-- Create function to generate entity embeddings text
CREATE OR REPLACE FUNCTION generate_entity_embedding_text(entity_row graph.entities)
RETURNS text AS $$
DECLARE
    embedding_text text := '';
BEGIN
    -- Basic entity info
    embedding_text := entity_row.name || ' ' || COALESCE(entity_row.type, '') || ' ';
    
    -- Domain and industry
    IF entity_row.domain IS NOT NULL THEN
        embedding_text := embedding_text || entity_row.domain || ' ';
    END IF;
    
    IF entity_row.industry IS NOT NULL THEN
        embedding_text := embedding_text || entity_row.industry || ' ';
    END IF;
    
    -- Pipeline and fund info
    IF entity_row.pipeline_stage IS NOT NULL THEN
        embedding_text := embedding_text || entity_row.pipeline_stage || ' ';
    END IF;
    
    IF entity_row.fund IS NOT NULL THEN
        embedding_text := embedding_text || entity_row.fund || ' ';
    END IF;
    
    -- Taxonomy and description
    IF entity_row.taxonomy IS NOT NULL THEN
        embedding_text := embedding_text || entity_row.taxonomy || ' ';
    END IF;
    
    IF entity_row.brief_description IS NOT NULL THEN
        embedding_text := embedding_text || entity_row.brief_description || ' ';
    END IF;
    
    -- Enrichment data
    IF entity_row.enrichment_data IS NOT NULL AND entity_row.enrichment_data != '{}' THEN
        embedding_text := embedding_text || entity_row.enrichment_data::text || ' ';
    END IF;
    
    -- Areas of expertise
    IF entity_row.areas_of_expertise IS NOT NULL AND array_length(entity_row.areas_of_expertise, 1) > 0 THEN
        embedding_text := embedding_text || array_to_string(entity_row.areas_of_expertise, ' ') || ' ';
    END IF;
    
    -- Employment history (first few entries)
    IF entity_row.employment_history IS NOT NULL AND jsonb_array_length(entity_row.employment_history) > 0 THEN
        embedding_text := embedding_text || entity_row.employment_history::text || ' ';
    END IF;
    
    -- Metadata
    IF entity_row.metadata IS NOT NULL AND entity_row.metadata != '{}' THEN
        embedding_text := embedding_text || entity_row.metadata::text || ' ';
    END IF;
    
    RETURN TRIM(embedding_text);
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies for new tables
ALTER TABLE graph.affinity_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.entity_notes_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.linkedin_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.sync_state ENABLE ROW LEVEL SECURITY;

-- Allow service role to access all tables
CREATE POLICY "Service role can access all affinity_files" ON graph.affinity_files
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all entity_notes_rollup" ON graph.entity_notes_rollup
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all linkedin_connections" ON graph.linkedin_connections
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access all sync_state" ON graph.sync_state
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to read data
CREATE POLICY "Authenticated users can read affinity_files" ON graph.affinity_files
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read entity_notes_rollup" ON graph.entity_notes_rollup
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read linkedin_connections" ON graph.linkedin_connections
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read sync_state" ON graph.sync_state
    FOR SELECT USING (auth.role() = 'authenticated');

-- Add comments for documentation
COMMENT ON TABLE graph.affinity_files IS 'File metadata from Affinity CRM with AI-generated summaries';
COMMENT ON TABLE graph.entity_notes_rollup IS 'Aggregated notes and reminders for entities with AI summaries';
COMMENT ON TABLE graph.linkedin_connections IS 'LinkedIn connection data for person entities';
COMMENT ON TABLE graph.sync_state IS 'Tracks Affinity API sync progress and rate limiting';

COMMENT ON COLUMN graph.entities.embedding IS 'Vector embedding for semantic search (1536 dimensions)';
COMMENT ON COLUMN graph.entities.enrichment_data IS 'Web research data: employment history, publications, expertise';
COMMENT ON COLUMN graph.entities.employment_history IS 'Structured employment history from web research';
COMMENT ON COLUMN graph.entities.publications IS 'Publications and speaking engagements';
COMMENT ON COLUMN graph.entities.areas_of_expertise IS 'Array of expertise areas identified from web research';
COMMENT ON COLUMN graph.entities.affinity_person_id IS 'Affinity CRM person ID for syncing';
COMMENT ON COLUMN graph.entities.affinity_org_id IS 'Affinity CRM organization ID for syncing';
COMMENT ON COLUMN graph.entities.linkedin_url IS 'LinkedIn profile URL';
COMMENT ON COLUMN graph.entities.enriched IS 'Whether entity has been enriched with web research';
COMMENT ON COLUMN graph.entities.pipeline_stage IS 'Deal pipeline stage (Qualified, Due Diligence, etc.)';
COMMENT ON COLUMN graph.entities.fund IS 'Fund association (MVF1, MVF2, etc.)';
COMMENT ON COLUMN graph.entities.taxonomy IS 'Industry taxonomy classification';
COMMENT ON COLUMN graph.entities.strength_score IS 'Calculated relationship strength based on interactions';
