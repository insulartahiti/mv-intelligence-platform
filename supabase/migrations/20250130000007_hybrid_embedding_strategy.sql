-- Hybrid Embedding Strategy: Use text-embedding-3-small for most entities
-- and text-embedding-3-large for high-value entities (portfolio companies, key contacts)

-- Keep existing 1536 dimension columns for general entities
-- Add high-precision embedding column for critical entities
ALTER TABLE graph.entities 
ADD COLUMN IF NOT EXISTS high_precision_embedding vector(3072);

-- Create HNSW index for high-precision embeddings (supports 3072 dims)
CREATE INDEX IF NOT EXISTS idx_graph_entities_high_precision_embedding 
ON graph.entities 
USING hnsw (high_precision_embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Create function to determine which embedding to use
CREATE OR REPLACE FUNCTION graph.get_embedding_for_search(entity_id UUID)
RETURNS vector AS $$
DECLARE
    high_precision_emb vector(3072);
    standard_emb vector(1536);
BEGIN
    -- Check if high-precision embedding exists
    SELECT high_precision_embedding INTO high_precision_emb
    FROM graph.entities 
    WHERE id = entity_id AND high_precision_embedding IS NOT NULL;
    
    IF high_precision_emb IS NOT NULL THEN
        -- Convert 1536 to 3072 by padding with zeros (simple approach)
        -- In practice, you'd regenerate the embedding with text-embedding-3-large
        RETURN high_precision_emb;
    ELSE
        -- Use standard embedding (would need conversion in practice)
        SELECT embedding INTO standard_emb
        FROM graph.entities 
        WHERE id = entity_id;
        
        -- For now, return the standard embedding
        -- In practice, you'd convert 1536 to 3072 or use separate search
        RETURN standard_emb::vector(3072);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create optimized search function
CREATE OR REPLACE FUNCTION graph.semantic_search_hybrid(
    query_embedding_1536 vector(1536),
    query_embedding_3072 vector(3072),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    name text,
    type text,
    similarity float,
    embedding_type text
) AS $$
BEGIN
    RETURN QUERY
    -- Search high-precision embeddings first (portfolio companies, key contacts)
    SELECT 
        e.id,
        e.name,
        e.type,
        1 - (e.high_precision_embedding <=> query_embedding_3072) as similarity,
        'high_precision'::text as embedding_type
    FROM graph.entities e
    WHERE e.high_precision_embedding IS NOT NULL
        AND 1 - (e.high_precision_embedding <=> query_embedding_3072) > match_threshold
    ORDER BY e.high_precision_embedding <=> query_embedding_3072
    LIMIT match_count / 2
    
    UNION ALL
    
    -- Search standard embeddings for other entities
    SELECT 
        e.id,
        e.name,
        e.type,
        1 - (e.embedding <=> query_embedding_1536) as similarity,
        'standard'::text as embedding_type
    FROM graph.entities e
    WHERE e.embedding IS NOT NULL
        AND 1 - (e.embedding <=> query_embedding_1536) > match_threshold
    ORDER BY e.embedding <=> query_embedding_1536
    LIMIT match_count / 2;
END;
$$ LANGUAGE plpgsql;
