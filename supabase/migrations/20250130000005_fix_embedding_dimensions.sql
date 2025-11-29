-- Fix embedding dimensions to support text-embedding-3-large (3072 dimensions)
-- This is a simple migration that just updates the column types

-- Update embedding column dimensions to support text-embedding-3-large (3072 dimensions)
ALTER TABLE graph.entities 
ALTER COLUMN embedding TYPE vector(3072);

-- Update other embedding columns to match
ALTER TABLE graph.affinity_files 
ALTER COLUMN embedding TYPE vector(3072);

-- Update entity_notes_rollup if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'graph' AND table_name = 'entity_notes_rollup') THEN
        ALTER TABLE graph.entity_notes_rollup 
        ALTER COLUMN embedding TYPE vector(3072);
    END IF;
END $$;
