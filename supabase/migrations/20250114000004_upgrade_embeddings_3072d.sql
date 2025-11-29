-- Enhanced Knowledge Graph Intelligence - Upgrade to 3072d Embeddings
-- Upgrade from text-embedding-3-small (1536d) to text-embedding-3-large (3072d)

-- First, create new columns for 3072d embeddings
ALTER TABLE graph.entities 
  ADD COLUMN IF NOT EXISTS embedding_3072 vector(3072);

ALTER TABLE graph.affinity_files 
  ADD COLUMN IF NOT EXISTS embedding_3072 vector(3072);

ALTER TABLE graph.entity_notes_rollup 
  ADD COLUMN IF NOT EXISTS embedding_3072 vector(3072);

-- Note: pgvector indexes (HNSW and IVFFlat) are limited to 2000 dimensions
-- For 3072d embeddings, we'll use sequential scan with cosine similarity
-- This is acceptable for the current scale (7,249 entities)
-- Consider upgrading to pgvector 0.6+ when it supports higher dimensions

-- Create regular B-tree indexes on computed fields for 3072d search optimization
CREATE INDEX IF NOT EXISTS idx_entities_embedding_3072_exists 
ON graph.entities (id) 
WHERE embedding_3072 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affinity_files_embedding_3072_exists 
ON graph.affinity_files (id) 
WHERE embedding_3072 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_notes_rollup_embedding_3072_exists 
ON graph.entity_notes_rollup (id) 
WHERE embedding_3072 IS NOT NULL;

-- Update existing functions to support both 1536d and 3072d
CREATE OR REPLACE FUNCTION graph.match_entities_3072(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  domain text,
  industry text,
  pipeline_stage text,
  fund text,
  taxonomy text,
  is_internal boolean,
  is_portfolio boolean,
  is_pipeline boolean,
  importance numeric,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    e.id,
    e.name,
    e.type,
    e.domain,
    e.industry,
    e.pipeline_stage,
    e.fund,
    e.taxonomy,
    e.is_internal,
    e.is_portfolio,
    e.is_pipeline,
    e.importance,
    1 - (e.embedding_3072 <=> query_embedding) AS similarity
  FROM graph.entities e
  WHERE e.embedding_3072 IS NOT NULL
    AND 1 - (e.embedding_3072 <=> query_embedding) > match_threshold
  ORDER BY e.embedding_3072 <=> query_embedding
  LIMIT match_count;
$$;

-- Update the graph-aware search function for 3072d
-- Note: This uses sequential scan since 3072d embeddings can't be indexed
CREATE OR REPLACE FUNCTION graph.semantic_search_with_graph_boost_3072(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  name text,
  type text,
  semantic_score float,
  graph_centrality float,
  final_score float
) AS $$
  WITH semantic_matches AS (
    SELECT 
      e.id,
      e.name,
      e.type,
      1 - (e.embedding_3072 <=> query_embedding) as semantic_score
    FROM graph.entities e
    WHERE e.embedding_3072 IS NOT NULL
      AND 1 - (e.embedding_3072 <=> query_embedding) > match_threshold
    ORDER BY e.embedding_3072 <=> query_embedding
    LIMIT match_count * 2  -- Get more candidates for graph ranking
  ),
  graph_metrics AS (
    SELECT 
      e.id,
      COUNT(DISTINCT ed.id)::float / NULLIF((SELECT COUNT(*) FROM graph.edges), 0) as centrality
    FROM graph.entities e
    LEFT JOIN graph.edges ed ON (e.id = ed.source OR e.id = ed.target)
    GROUP BY e.id
  )
  SELECT 
    sm.id,
    sm.name,
    sm.type,
    sm.semantic_score,
    COALESCE(gm.centrality, 0) as graph_centrality,
    (sm.semantic_score * 0.7 + COALESCE(gm.centrality, 0) * 0.3) as final_score
  FROM semantic_matches sm
  LEFT JOIN graph_metrics gm ON sm.id = gm.id
  ORDER BY final_score DESC
  LIMIT match_count;
$$ LANGUAGE sql;

-- Create a migration function to generate 3072d embeddings
CREATE OR REPLACE FUNCTION graph.migrate_embeddings_to_3072d(
  batch_size int DEFAULT 10,
  max_entities int DEFAULT NULL
) RETURNS TABLE (
  entity_id uuid,
  success boolean,
  error_message text
) AS $$
DECLARE
  entity_record RECORD;
  processed_count int := 0;
  openai_api_key text;
  embedding_response jsonb;
  new_embedding vector(3072);
BEGIN
  -- Get OpenAI API key from environment
  SELECT current_setting('app.settings.openai_api_key', true) INTO openai_api_key;
  
  IF openai_api_key IS NULL THEN
    RAISE EXCEPTION 'OpenAI API key not found in app.settings.openai_api_key';
  END IF;
  
  -- Process entities in batches
  FOR entity_record IN 
    SELECT id, name, type, domain, industry, pipeline_stage, fund, taxonomy
    FROM graph.entities 
    WHERE embedding_3072 IS NULL
    AND (max_entities IS NULL OR processed_count < max_entities)
    ORDER BY importance DESC NULLS LAST, created_at DESC
    LIMIT batch_size
  LOOP
    BEGIN
      -- Generate embedding using OpenAI API
      SELECT content INTO embedding_response
      FROM http((
        'POST',
        'https://api.openai.com/v1/embeddings',
        ARRAY[http_header('Authorization', 'Bearer ' || openai_api_key)],
        'application/json',
        json_build_object(
          'model', 'text-embedding-3-large',
          'input', COALESCE(entity_record.name, '') || ' ' || 
                   COALESCE(entity_record.type, '') || ' ' || 
                   COALESCE(entity_record.domain, '') || ' ' || 
                   COALESCE(entity_record.industry, '') || ' ' || 
                   COALESCE(entity_record.pipeline_stage, '') || ' ' || 
                   COALESCE(entity_record.fund, '') || ' ' || 
                   COALESCE(entity_record.taxonomy, '')
        )::text
      ));
      
      -- Extract embedding from response
      new_embedding := (
        SELECT vector(ARRAY(SELECT jsonb_array_elements_text(embedding_response->'data'->0->'embedding')))
      );
      
      -- Update entity with new embedding
      UPDATE graph.entities 
      SET embedding_3072 = new_embedding
      WHERE id = entity_record.id;
      
      processed_count := processed_count + 1;
      
      -- Return success
      RETURN QUERY SELECT entity_record.id, true, NULL::text;
      
    EXCEPTION WHEN OTHERS THEN
      -- Return error
      RETURN QUERY SELECT entity_record.id, false, SQLERRM;
    END;
    
    -- Small delay to respect rate limits
    PERFORM pg_sleep(0.1);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION graph.match_entities_3072 TO authenticated;
GRANT EXECUTE ON FUNCTION graph.semantic_search_with_graph_boost_3072 TO authenticated;
GRANT EXECUTE ON FUNCTION graph.migrate_embeddings_to_3072d TO authenticated;
