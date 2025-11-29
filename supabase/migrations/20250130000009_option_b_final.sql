-- Final Option B implementation: text-embedding-3-large (3072 dimensions) + HNSW indexes
-- This provides the best AI semantic search performance with manageable latency

-- Drop existing ivfflat indexes that are causing the error
DROP INDEX IF EXISTS idx_file_processing_embedding;
DROP INDEX IF EXISTS entity_embeddings_vector_idx;
DROP INDEX IF EXISTS idx_graph_entities_embedding;
DROP INDEX IF EXISTS idx_graph_affinity_files_embedding;
DROP INDEX IF EXISTS idx_graph_entity_notes_rollup_embedding;

-- Also drop any existing HNSW indexes to avoid conflicts
DROP INDEX IF EXISTS idx_file_processing_embedding_hnsw;
DROP INDEX IF EXISTS entity_embeddings_vector_hnsw;
DROP INDEX IF EXISTS idx_graph_entities_embedding_hnsw;
DROP INDEX IF EXISTS idx_graph_affinity_files_embedding_hnsw;
DROP INDEX IF EXISTS idx_graph_entity_notes_rollup_embedding_hnsw;

-- Update all embedding columns to use 3072 dimensions (text-embedding-3-large)
-- Use IF EXISTS to handle cases where columns might not exist
DO $$
BEGIN
    -- Update graph.entities embedding column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'graph' AND table_name = 'entities' AND column_name = 'embedding') THEN
        ALTER TABLE graph.entities ALTER COLUMN embedding TYPE vector(3072);
        RAISE NOTICE 'Updated graph.entities.embedding to vector(3072)';
    END IF;
    
    -- Update graph.affinity_files embedding column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'graph' AND table_name = 'affinity_files' AND column_name = 'embedding') THEN
        ALTER TABLE graph.affinity_files ALTER COLUMN embedding TYPE vector(3072);
        RAISE NOTICE 'Updated graph.affinity_files.embedding to vector(3072)';
    END IF;
    
    -- Update graph.entity_notes_rollup embedding column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'graph' AND table_name = 'entity_notes_rollup' AND column_name = 'embedding') THEN
        ALTER TABLE graph.entity_notes_rollup ALTER COLUMN embedding TYPE vector(3072);
        RAISE NOTICE 'Updated graph.entity_notes_rollup.embedding to vector(3072)';
    END IF;
    
    -- Update graph.file_processing_log embedding column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'graph' AND table_name = 'file_processing_log' AND column_name = 'embedding') THEN
        ALTER TABLE graph.file_processing_log ALTER COLUMN embedding TYPE vector(3072);
        RAISE NOTICE 'Updated graph.file_processing_log.embedding to vector(3072)';
    END IF;
END $$;

-- Update entity_embeddings table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entity_embeddings') THEN
        ALTER TABLE entity_embeddings ALTER COLUMN vector TYPE vector(3072);
        RAISE NOTICE 'Updated entity_embeddings.vector to vector(3072)';
    END IF;
END $$;

-- Update embeddings table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'embeddings') THEN
        ALTER TABLE embeddings ALTER COLUMN vector TYPE vector(3072);
        RAISE NOTICE 'Updated embeddings.vector to vector(3072)';
    END IF;
END $$;

-- Create HNSW indexes for optimal performance with 3072 dimensions
-- HNSW supports higher dimensions and provides better query performance

-- File processing log HNSW index
CREATE INDEX IF NOT EXISTS idx_file_processing_embedding_hnsw ON graph.file_processing_log 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Entity embeddings HNSW index
CREATE INDEX IF NOT EXISTS entity_embeddings_vector_hnsw ON entity_embeddings 
USING hnsw (vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Graph entities HNSW index
CREATE INDEX IF NOT EXISTS idx_graph_entities_embedding_hnsw ON graph.entities 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Graph affinity files HNSW index
CREATE INDEX IF NOT EXISTS idx_graph_affinity_files_embedding_hnsw ON graph.affinity_files 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Graph entity notes rollup HNSW index
CREATE INDEX IF NOT EXISTS idx_graph_entity_notes_rollup_embedding_hnsw ON graph.entity_notes_rollup 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Create optimized search function for 3072 dimensions
CREATE OR REPLACE FUNCTION graph.semantic_search_3072(
    query_embedding vector(3072),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 20,
    entity_type_filter text DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name text,
    type text,
    similarity float,
    metadata jsonb
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name,
        e.type,
        1 - (e.embedding <=> query_embedding) as similarity,
        e.metadata
    FROM graph.entities e
    WHERE e.embedding IS NOT NULL
        AND 1 - (e.embedding <=> query_embedding) > match_threshold
        AND (entity_type_filter IS NULL OR e.type = entity_type_filter)
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Create hybrid search function that can search across multiple tables
CREATE OR REPLACE FUNCTION graph.universal_semantic_search(
    query_embedding vector(3072),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    name text,
    type text,
    similarity float,
    source_table text,
    metadata jsonb
) AS $$
BEGIN
    RETURN QUERY
    -- Search entities
    SELECT 
        e.id,
        e.name,
        e.type,
        1 - (e.embedding <=> query_embedding) as similarity,
        'entities'::text as source_table,
        e.metadata
    FROM graph.entities e
    WHERE e.embedding IS NOT NULL
        AND 1 - (e.embedding <=> query_embedding) > match_threshold
    
    UNION ALL
    
    -- Search affinity files
    SELECT 
        f.id,
        f.name,
        'file'::text as type,
        1 - (f.embedding <=> query_embedding) as similarity,
        'affinity_files'::text as source_table,
        jsonb_build_object('file_type', f.file_type, 'size_bytes', f.size_bytes, 'affinity_url', f.affinity_url)
    FROM graph.affinity_files f
    WHERE f.embedding IS NOT NULL
        AND 1 - (f.embedding <=> query_embedding) > match_threshold
    
    UNION ALL
    
    -- Search entity notes rollup
    SELECT 
        n.entity_id as id,
        'Notes Summary'::text as name,
        'notes'::text as type,
        1 - (n.embedding <=> query_embedding) as similarity,
        'entity_notes_rollup'::text as source_table,
        jsonb_build_object('notes_count', n.notes_count, 'last_updated', n.last_updated)
    FROM graph.entity_notes_rollup n
    WHERE n.embedding IS NOT NULL
        AND 1 - (n.embedding <=> query_embedding) > match_threshold
    
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments explaining the HNSW parameters
COMMENT ON INDEX idx_graph_entities_embedding_hnsw IS 'HNSW index for fast vector similarity search on entity embeddings. m=16 (connections per node), ef_construction=64 (search width during build)';
COMMENT ON INDEX idx_graph_affinity_files_embedding_hnsw IS 'HNSW index for fast vector similarity search on file embeddings';
COMMENT ON INDEX idx_graph_entity_notes_rollup_embedding_hnsw IS 'HNSW index for fast vector similarity search on notes rollup embeddings';
