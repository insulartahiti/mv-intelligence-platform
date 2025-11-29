-- Create Graph Schema Migration
-- This creates the graph schema and tables from scratch

-- Create graph schema
CREATE SCHEMA IF NOT EXISTS graph;

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create comprehensive entities table
CREATE TABLE graph.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('organization', 'person', 'fund', 'deal')),
  domain text,
  industry text,
  pipeline_stage text,
  fund text,
  taxonomy text,
  valuation_amount numeric,
  investment_amount numeric,
  year_founded integer,
  employee_count integer,
  location_city text,
  location_country text,
  urgency text,
  series text,
  founder_gender text,
  pass_lost_reason text,
  sourced_by text,
  notion_page text,
  related_deals text[],
  apollo_taxonomy text,
  brief_description text,
  source text DEFAULT 'affinity_api_sync',
  affinity_org_id bigint,
  affinity_person_id bigint,
  linkedin_url text,
  
  -- Enrichment fields
  enrichment_data jsonb DEFAULT '{}',
  employment_history jsonb DEFAULT '[]',
  publications jsonb DEFAULT '[]',
  areas_of_expertise text[] DEFAULT '{}',
  enriched boolean DEFAULT false,
  last_enriched_at timestamp with time zone,
  
  -- Embeddings
  embedding vector(1536),
  
  -- Metadata
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create edges table for relationships
CREATE TABLE graph.edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source uuid NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
  target uuid NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('owner', 'deal_team', 'contact', 'works_at', 'invests_in', 'advises', 'introduced_by', 'worked_with', 'portfolio_company_of', 'competed_with')),
  strength_score float DEFAULT 0.5,
  source_type text DEFAULT 'affinity_api_sync',
  
  -- Interaction tracking
  interaction_count integer DEFAULT 0,
  last_interaction_date timestamp with time zone,
  interaction_summary text,
  interaction_types text[] DEFAULT '{}',
  
  -- Metadata
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Ensure no duplicate edges
  UNIQUE(source, target, kind)
);

-- Create sync state table
CREATE TABLE graph.sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_sync_timestamp timestamp with time zone DEFAULT now(),
  entities_synced integer DEFAULT 0,
  rate_limit_remaining integer DEFAULT 300,
  next_sync_allowed timestamp with time zone DEFAULT now(),
  sync_type text DEFAULT 'incremental',
  status text DEFAULT 'idle',
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create affinity files table
CREATE TABLE graph.affinity_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES graph.entities(id) ON DELETE CASCADE,
  affinity_file_id bigint NOT NULL,
  name text NOT NULL,
  url text,
  size_bytes bigint,
  mime_type text,
  ai_summary text,
  embedding vector(1536),
  processed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create entity notes rollup table
CREATE TABLE graph.entity_notes_rollup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES graph.entities(id) ON DELETE CASCADE,
  latest_summary text,
  notes_count integer DEFAULT 0,
  reminders_count integer DEFAULT 0,
  last_updated timestamp with time zone DEFAULT now(),
  embedding vector(1536),
  UNIQUE(entity_id)
);

-- Create LinkedIn connections table
CREATE TABLE graph.linkedin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_entity_id uuid REFERENCES graph.entities(id) ON DELETE CASCADE,
  linkedin_profile_url text NOT NULL,
  connection_date timestamp with time zone,
  mutual_connections text[] DEFAULT '{}',
  connection_strength text DEFAULT 'medium',
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(person_entity_id, linkedin_profile_url)
);

-- Create indexes for performance
CREATE INDEX idx_entities_type ON graph.entities(type);
CREATE INDEX idx_entities_domain ON graph.entities(domain);
CREATE INDEX idx_entities_industry ON graph.entities(industry);
CREATE INDEX idx_entities_pipeline_stage ON graph.entities(pipeline_stage);
CREATE INDEX idx_entities_fund ON graph.entities(fund);
CREATE INDEX idx_entities_affinity_org_id ON graph.entities(affinity_org_id);
CREATE INDEX idx_entities_affinity_person_id ON graph.entities(affinity_person_id);
CREATE INDEX idx_entities_source ON graph.entities(source);

CREATE INDEX idx_edges_source ON graph.edges(source);
CREATE INDEX idx_edges_target ON graph.edges(target);
CREATE INDEX idx_edges_kind ON graph.edges(kind);
CREATE INDEX idx_edges_strength_score ON graph.edges(strength_score);

CREATE INDEX idx_affinity_files_entity_id ON graph.affinity_files(entity_id);
CREATE INDEX idx_affinity_files_affinity_file_id ON graph.affinity_files(affinity_file_id);
CREATE INDEX idx_affinity_files_processed ON graph.affinity_files(processed);

CREATE INDEX idx_entity_notes_rollup_entity_id ON graph.entity_notes_rollup(entity_id);

CREATE INDEX idx_linkedin_connections_person_entity_id ON graph.linkedin_connections(person_entity_id);

-- Create vector similarity indexes for embeddings
CREATE INDEX idx_entities_embedding ON graph.entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_affinity_files_embedding ON graph.affinity_files USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_entity_notes_rollup_embedding ON graph.entity_notes_rollup USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION graph.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON graph.entities FOR EACH ROW EXECUTE FUNCTION graph.update_updated_at_column();
CREATE TRIGGER update_edges_updated_at BEFORE UPDATE ON graph.edges FOR EACH ROW EXECUTE FUNCTION graph.update_updated_at_column();
CREATE TRIGGER update_sync_state_updated_at BEFORE UPDATE ON graph.sync_state FOR EACH ROW EXECUTE FUNCTION graph.update_updated_at_column();
CREATE TRIGGER update_affinity_files_updated_at BEFORE UPDATE ON graph.affinity_files FOR EACH ROW EXECUTE FUNCTION graph.update_updated_at_column();

-- Insert default sync state
INSERT INTO graph.sync_state (id, last_sync_timestamp, entities_synced, rate_limit_remaining, next_sync_allowed) 
VALUES (gen_random_uuid(), '1970-01-01T00:00:00Z', 0, 300, now());

-- Enable RLS
ALTER TABLE graph.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.affinity_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.entity_notes_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.linkedin_connections ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT USAGE ON SCHEMA graph TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA graph TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA graph TO authenticated;
