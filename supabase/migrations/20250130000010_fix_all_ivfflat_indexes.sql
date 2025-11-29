-- Fix all ivfflat indexes to use HNSW for 3072 dimensions
-- This migration ensures no ivfflat indexes are created on high-dimensional vectors

-- Drop ALL existing ivfflat indexes that might conflict with 3072 dimensions
DROP INDEX IF EXISTS idx_file_processing_embedding;
DROP INDEX IF EXISTS entity_embeddings_vector_idx;
DROP INDEX IF EXISTS idx_graph_entities_embedding;
DROP INDEX IF EXISTS idx_graph_affinity_files_embedding;
DROP INDEX IF EXISTS idx_graph_entity_notes_rollup_embedding;
DROP INDEX IF EXISTS idx_graph_file_processing_log_embedding;
DROP INDEX IF EXISTS idx_embeddings_vector;
DROP INDEX IF EXISTS idx_artifacts_embedding;
DROP INDEX IF EXISTS idx_entities_embedding;
DROP INDEX IF EXISTS idx_affinity_files_embedding;
DROP INDEX IF EXISTS idx_notes_rollup_embedding;
DROP INDEX IF EXISTS idx_file_insights_embedding;
DROP INDEX IF EXISTS embeddings_vector_idx;

-- Drop any existing HNSW indexes to start fresh
DROP INDEX IF EXISTS idx_file_processing_embedding_hnsw;
DROP INDEX IF EXISTS entity_embeddings_vector_hnsw;
DROP INDEX IF EXISTS idx_graph_entities_embedding_hnsw;
DROP INDEX IF EXISTS idx_graph_affinity_files_embedding_hnsw;
DROP INDEX IF EXISTS idx_graph_entity_notes_rollup_embedding_hnsw;
DROP INDEX IF EXISTS idx_graph_file_processing_log_embedding_hnsw;
DROP INDEX IF EXISTS idx_embeddings_vector_hnsw;
DROP INDEX IF EXISTS idx_artifacts_embedding_hnsw;
DROP INDEX IF EXISTS idx_entities_embedding_hnsw;
DROP INDEX IF EXISTS idx_affinity_files_embedding_hnsw;
DROP INDEX IF EXISTS idx_notes_rollup_embedding_hnsw;
DROP INDEX IF EXISTS idx_file_insights_embedding_hnsw;
DROP INDEX IF EXISTS embeddings_vector_hnsw;

-- Create HNSW indexes for all embedding columns
-- These will work with 3072 dimensions and provide better performance

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

-- Graph file processing log HNSW index
CREATE INDEX IF NOT EXISTS idx_graph_file_processing_log_embedding_hnsw ON graph.file_processing_log 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Graph file insights HNSW index (if table exists)
CREATE INDEX IF NOT EXISTS idx_graph_file_insights_embedding_hnsw ON graph.file_insights 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Entity embeddings HNSW index (if table exists)
CREATE INDEX IF NOT EXISTS entity_embeddings_vector_hnsw ON entity_embeddings 
USING hnsw (vector vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Embeddings table HNSW index (if table exists)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector_hnsw ON embeddings 
USING hnsw (vector vector_cosine_ops) 
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

-- Create universal search function
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
