-- Knowledge Graph Schema for Affinity-Centric Intelligence Platform
-- Single-tenant, high-performance design

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- CORE ENTITIES (Single Tenant)
-- ============================================================================

-- Companies (linked to Affinity organizations)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT,
  affinity_org_id INTEGER UNIQUE, -- Link to Affinity
  industry TEXT,
  company_type TEXT,
  website TEXT,
  description TEXT,
  employees INTEGER,
  funding_stage TEXT,
  revenue_range TEXT,
  location TEXT,
  tags TEXT[] DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts (linked to Affinity persons)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  title TEXT,
  affinity_person_id INTEGER UNIQUE, -- Link to Affinity
  company_id UUID REFERENCES companies(id),
  linkedin_url TEXT,
  tags TEXT[] DEFAULT '{}',
  last_interaction_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INTELLIGENCE ARTIFACTS (Metadata Only)
-- ============================================================================

-- Add missing columns to existing artifacts table
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS affinity_file_id TEXT;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS affinity_org_id INTEGER;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS affinity_person_id INTEGER;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- ============================================================================
-- HIGH-PERFORMANCE EMBEDDINGS
-- ============================================================================

-- Embeddings (chunked text only, no raw files)
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  vector VECTOR(1536), -- OpenAI text-embedding-3-small
  chunk_index INTEGER NOT NULL,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RELATIONSHIP GRAPH
-- ============================================================================

-- Contact-to-contact relationships
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_contact UUID REFERENCES contacts(id) ON DELETE CASCADE,
  to_contact UUID REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  strength NUMERIC DEFAULT 0.5, -- 0-1 relationship strength
  last_interaction TIMESTAMPTZ,
  source TEXT, -- 'email', 'meeting', 'affinity', 'linkedin', 'manual'
  interaction_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_contact, to_contact, source)
);

-- ============================================================================
-- ENTITY EXTRACTION
-- ============================================================================

-- Extracted entities (companies, people, topics, metrics)
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('company', 'person', 'topic', 'metric', 'product', 'event')),
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  importance NUMERIC DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(kind, name)
);

-- Entity mentions in artifacts
CREATE TABLE IF NOT EXISTS mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  confidence NUMERIC DEFAULT 0.8,
  context TEXT, -- Surrounding text for context
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INTERACTIONS (From Affinity)
-- ============================================================================

-- Interactions (emails, meetings, calls from Affinity)
CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affinity_interaction_id INTEGER UNIQUE, -- Link to Affinity
  interaction_type TEXT NOT NULL, -- 'email', 'meeting', 'call', 'note'
  subject TEXT,
  content_preview TEXT, -- First 500 chars
  company_id UUID REFERENCES companies(id),
  participants UUID[] NOT NULL, -- Array of contact IDs
  started_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  source TEXT DEFAULT 'affinity',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Vector search optimization
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);

-- Text search optimization
CREATE INDEX IF NOT EXISTS embeddings_text_gin ON embeddings USING gin(to_tsvector('english', chunk_text));
CREATE INDEX IF NOT EXISTS companies_name_gin ON companies USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS contacts_name_gin ON contacts USING gin(to_tsvector('english', name));

-- Relationship graph optimization
CREATE INDEX IF NOT EXISTS relationships_from_idx ON relationships(from_contact);
CREATE INDEX IF NOT EXISTS relationships_to_idx ON relationships(to_contact);
CREATE INDEX IF NOT EXISTS relationships_company_idx ON relationships(company_id);

-- Affinity linking optimization
CREATE INDEX IF NOT EXISTS companies_affinity_idx ON companies(affinity_org_id);
CREATE INDEX IF NOT EXISTS contacts_affinity_idx ON contacts(affinity_person_id);
CREATE INDEX IF NOT EXISTS artifacts_affinity_file_idx ON artifacts(affinity_file_id);

-- Entity search optimization
CREATE INDEX IF NOT EXISTS entities_name_trgm ON entities USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS entities_aliases_gin ON entities USING gin(aliases);

-- ============================================================================
-- ROW LEVEL SECURITY (Simple - Single Tenant)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- Simple policies (authenticated users only)
DROP POLICY IF EXISTS companies_all ON companies;
DROP POLICY IF EXISTS contacts_all ON contacts;
DROP POLICY IF EXISTS artifacts_all ON artifacts;
DROP POLICY IF EXISTS embeddings_all ON embeddings;
DROP POLICY IF EXISTS relationships_all ON relationships;
DROP POLICY IF EXISTS entities_all ON entities;
DROP POLICY IF EXISTS mentions_all ON mentions;
DROP POLICY IF EXISTS interactions_all ON interactions;

CREATE POLICY companies_all ON companies FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY contacts_all ON contacts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY artifacts_all ON artifacts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY embeddings_all ON embeddings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY relationships_all ON relationships FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY entities_all ON entities FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY mentions_all ON mentions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY interactions_all ON interactions FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- HIGH-PERFORMANCE SEARCH FUNCTIONS
-- ============================================================================

-- Hybrid search function (vector + text)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_vector VECTOR(1536),
  limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  artifact_id UUID,
  chunk_text TEXT,
  title TEXT,
  company_name TEXT,
  vector_score FLOAT,
  text_score FLOAT,
  combined_score FLOAT
) AS $$
  WITH vector_matches AS (
    SELECT 
      e.artifact_id,
      e.chunk_text,
      a.title,
      c.name as company_name,
      1 - (e.vector <=> query_vector) as vector_score,
      similarity(e.chunk_text, query_text) as text_score
    FROM embeddings e
    JOIN artifacts a ON a.id = e.artifact_id
    LEFT JOIN companies c ON c.id = a.company_id
    WHERE e.vector IS NOT NULL
    ORDER BY e.vector <=> query_vector
    LIMIT limit_count * 2
  )
  SELECT 
    artifact_id,
    chunk_text,
    title,
    company_name,
    vector_score,
    text_score,
    (0.7 * vector_score + 0.3 * text_score) as combined_score
  FROM vector_matches
  ORDER BY combined_score DESC
  LIMIT limit_count;
$$ LANGUAGE SQL;

-- Warm paths function (2-hop relationship traversal)
CREATE OR REPLACE FUNCTION find_warm_paths(
  source_contact_id UUID,
  target_company_id UUID,
  max_hops INTEGER DEFAULT 2
)
RETURNS TABLE (
  path_contacts UUID[],
  total_strength NUMERIC,
  hop_count INTEGER
) AS $$
  WITH RECURSIVE path_search AS (
    -- Direct connections
    SELECT 
      ARRAY[source_contact_id, r.to_contact] as path_contacts,
      r.strength as total_strength,
      1 as hop_count
    FROM relationships r
    JOIN contacts c ON c.id = r.to_contact
    WHERE r.from_contact = source_contact_id
      AND c.company_id = target_company_id
    
    UNION ALL
    
    -- 2-hop connections
    SELECT 
      ARRAY[source_contact_id, r1.to_contact, r2.to_contact] as path_contacts,
      LEAST(r1.strength, r2.strength) as total_strength,
      2 as hop_count
    FROM relationships r1
    JOIN relationships r2 ON r2.from_contact = r1.to_contact
    JOIN contacts c ON c.id = r2.to_contact
    WHERE r1.from_contact = source_contact_id
      AND c.company_id = target_company_id
      AND r1.to_contact != r2.to_contact
  )
  SELECT 
    path_contacts,
    total_strength,
    hop_count
  FROM path_search
  ORDER BY total_strength DESC, hop_count ASC
  LIMIT 10;
$$ LANGUAGE SQL;
