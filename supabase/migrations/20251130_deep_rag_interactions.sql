-- Ensure table exists
CREATE TABLE IF NOT EXISTS graph.interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES graph.entities(id) ON DELETE CASCADE,
    affinity_note_id INTEGER,
    type TEXT NOT NULL,
    content TEXT,
    summary TEXT,
    author_name TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    risk_flags TEXT[],
    key_themes TEXT[]
);

-- Add embedding column if not exists (using safe DO block)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'graph' AND table_name = 'interactions' AND column_name = 'embedding') THEN
        ALTER TABLE graph.interactions ADD COLUMN embedding vector(2000);
    END IF;
END $$;

-- Create Index
CREATE INDEX IF NOT EXISTS idx_interactions_embedding ON graph.interactions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create Search Function
CREATE OR REPLACE FUNCTION search_interactions(
    query_embedding vector(2000),
    match_threshold float,
    match_count int,
    filter_entity_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    entity_id uuid,
    content text,
    summary text,
    type text,
    occurred_at timestamptz,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id,
        i.entity_id,
        i.content,
        i.summary,
        i.type,
        i.occurred_at,
        1 - (i.embedding <=> query_embedding) as similarity
    FROM
        graph.interactions i
    WHERE
        1 - (i.embedding <=> query_embedding) > match_threshold
        AND (filter_entity_id IS NULL OR i.entity_id = filter_entity_id)
    ORDER BY
        i.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

