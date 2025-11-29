-- Fix embedding dimensions to use text-embedding-3-small (1536 dimensions)
-- This resolves the Supabase 2000 dimension limit for ivfflat indexes

-- Drop existing ivfflat indexes that are causing the error
DROP INDEX IF EXISTS idx_file_processing_embedding;
DROP INDEX IF EXISTS entity_embeddings_vector_idx;

-- Update all embedding columns to use 1536 dimensions (text-embedding-3-small)
ALTER TABLE graph.entities 
ALTER COLUMN embedding TYPE vector(1536);

ALTER TABLE graph.affinity_files 
ALTER COLUMN embedding TYPE vector(1536);

ALTER TABLE graph.entity_notes_rollup 
ALTER COLUMN embedding TYPE vector(1536);

-- Update file processing log table
ALTER TABLE graph.file_processing_log 
ALTER COLUMN embedding TYPE vector(1536);

-- Update entity_embeddings table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entity_embeddings') THEN
        ALTER TABLE entity_embeddings 
        ALTER COLUMN vector TYPE vector(1536);
    END IF;
END $$;

-- Update embeddings table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'embeddings') THEN
        ALTER TABLE embeddings 
        ALTER COLUMN vector TYPE vector(1536);
    END IF;
END $$;

-- Recreate ivfflat indexes with 1536 dimensions
CREATE INDEX IF NOT EXISTS idx_file_processing_embedding ON graph.file_processing_log 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS entity_embeddings_vector_idx ON entity_embeddings 
USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);

-- Create indexes for graph tables
CREATE INDEX IF NOT EXISTS idx_graph_entities_embedding ON graph.entities 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_graph_affinity_files_embedding ON graph.affinity_files 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_graph_entity_notes_rollup_embedding ON graph.entity_notes_rollup 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
