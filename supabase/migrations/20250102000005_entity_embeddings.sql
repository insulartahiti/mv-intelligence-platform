-- Entity Embeddings Table for Universal Search
-- This table stores embeddings for all entity types (companies, contacts, interactions)

CREATE TABLE IF NOT EXISTS entity_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'company', 'contact', 'interaction', 'artifact'
  entity_id UUID NOT NULL,
  text_content TEXT NOT NULL,
  vector VECTOR(1536), -- OpenAI text-embedding-3-small
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, entity_id)
);

-- Create index for fast vector similarity search
CREATE INDEX IF NOT EXISTS entity_embeddings_vector_idx ON entity_embeddings 
USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);

-- Create index for entity lookups
CREATE INDEX IF NOT EXISTS entity_embeddings_entity_idx ON entity_embeddings (entity_type, entity_id);

-- Enable RLS
ALTER TABLE entity_embeddings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all operations for service role" ON entity_embeddings
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow read access for authenticated users" ON entity_embeddings
  FOR SELECT USING (auth.role() = 'authenticated');


