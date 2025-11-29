-- Fix embedding dimensions and add proper file processing support
-- This migration updates the schema to support 3072-dimensional embeddings and proper file processing

-- 1. Update embedding column dimensions to support text-embedding-3-large (3072 dimensions)
ALTER TABLE graph.entities 
ALTER COLUMN embedding TYPE vector(3072);

-- 2. Update other embedding columns to match
ALTER TABLE graph.affinity_files 
ALTER COLUMN embedding TYPE vector(3072);

ALTER TABLE graph.entity_notes_rollup 
ALTER COLUMN embedding TYPE vector(3072);

-- 3. Create enhanced file processing table (no actual file storage)
CREATE TABLE IF NOT EXISTS graph.file_processing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affinity_file_id BIGINT NOT NULL,
  entity_id UUID REFERENCES graph.entities(id),
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size_bytes BIGINT,
  affinity_url TEXT NOT NULL, -- Link to original file in Affinity
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  ai_summary TEXT,
  extracted_text TEXT, -- Full extracted text content
  text_chunks JSONB, -- Array of text chunks for better processing
  embedding vector(3072), -- Embedding of the summary
  chunk_embeddings JSONB, -- Array of embeddings for each chunk
  processing_metadata JSONB, -- Store processing details, confidence scores, etc.
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create indexes for file processing
CREATE INDEX IF NOT EXISTS idx_file_processing_affinity_file_id ON graph.file_processing_log(affinity_file_id);
CREATE INDEX IF NOT EXISTS idx_file_processing_entity_id ON graph.file_processing_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_file_processing_status ON graph.file_processing_log(processing_status);
CREATE INDEX IF NOT EXISTS idx_file_processing_embedding ON graph.file_processing_log USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 5. Create file processing queue table for batch processing
CREATE TABLE IF NOT EXISTS graph.file_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_processing_log_id UUID REFERENCES graph.file_processing_log(id),
  priority INTEGER DEFAULT 0,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'retry')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create file content analysis table for extracted insights
CREATE TABLE IF NOT EXISTS graph.file_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_processing_log_id UUID REFERENCES graph.file_processing_log(id),
  insight_type TEXT NOT NULL, -- 'summary', 'key_points', 'entities', 'financial_data', 'risks', 'opportunities'
  insight_content TEXT NOT NULL,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  embedding vector(3072),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create indexes for file insights
CREATE INDEX IF NOT EXISTS idx_file_insights_file_id ON graph.file_insights(file_processing_log_id);
CREATE INDEX IF NOT EXISTS idx_file_insights_type ON graph.file_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_file_insights_embedding ON graph.file_insights USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 8. Update existing affinity_files table to link to file processing
ALTER TABLE graph.affinity_files 
ADD COLUMN IF NOT EXISTS file_processing_log_id UUID REFERENCES graph.file_processing_log(id);

-- 9. Create function to update file processing status
CREATE OR REPLACE FUNCTION update_file_processing_status()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Add triggers for updated_at
CREATE TRIGGER update_file_processing_log_updated_at
  BEFORE UPDATE ON graph.file_processing_log
  FOR EACH ROW
  EXECUTE FUNCTION update_file_processing_status();

CREATE TRIGGER update_file_insights_updated_at
  BEFORE UPDATE ON graph.file_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_file_processing_status();

-- 11. Create function to clean up processed files (remove extracted text after processing)
CREATE OR REPLACE FUNCTION cleanup_processed_file_content()
RETURNS TRIGGER AS $$
BEGIN
  -- After file is processed and insights are extracted, remove the large text content
  -- but keep the summary and metadata
  IF NEW.processing_status = 'completed' AND OLD.processing_status != 'completed' THEN
    UPDATE graph.file_processing_log 
    SET extracted_text = NULL,
        text_chunks = NULL
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12. Add cleanup trigger
CREATE TRIGGER cleanup_file_content_after_processing
  AFTER UPDATE ON graph.file_processing_log
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_processed_file_content();

-- 13. Create RLS policies for new tables
ALTER TABLE graph.file_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.file_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.file_insights ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage file processing" ON graph.file_processing_log
  FOR ALL USING (true);

CREATE POLICY "Service role can manage file queue" ON graph.file_processing_queue
  FOR ALL USING (true);

CREATE POLICY "Service role can manage file insights" ON graph.file_insights
  FOR ALL USING (true);

-- 14. Create view for file processing status
CREATE OR REPLACE VIEW graph.file_processing_status AS
SELECT 
  fpl.id,
  fpl.affinity_file_id,
  fpl.file_name,
  fpl.file_type,
  fpl.processing_status,
  fpl.ai_summary,
  fpl.affinity_url,
  fpl.processed_at,
  e.name as entity_name,
  e.type as entity_type,
  COUNT(fi.id) as insights_count
FROM graph.file_processing_log fpl
LEFT JOIN graph.entities e ON fpl.entity_id = e.id
LEFT JOIN graph.file_insights fi ON fpl.id = fi.file_processing_log_id
GROUP BY fpl.id, fpl.affinity_file_id, fpl.file_name, fpl.file_type, 
         fpl.processing_status, fpl.ai_summary, fpl.affinity_url, 
         fpl.processed_at, e.name, e.type;

-- 15. Create function to get file processing statistics
CREATE OR REPLACE FUNCTION get_file_processing_stats()
RETURNS TABLE(
  total_files BIGINT,
  pending_files BIGINT,
  processing_files BIGINT,
  completed_files BIGINT,
  failed_files BIGINT,
  total_insights BIGINT,
  avg_processing_time_seconds NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_files,
    COUNT(*) FILTER (WHERE processing_status = 'pending') as pending_files,
    COUNT(*) FILTER (WHERE processing_status = 'processing') as processing_files,
    COUNT(*) FILTER (WHERE processing_status = 'completed') as completed_files,
    COUNT(*) FILTER (WHERE processing_status = 'failed') as failed_files,
    (SELECT COUNT(*) FROM graph.file_insights) as total_insights,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds
  FROM graph.file_processing_log;
END;
$$ LANGUAGE plpgsql;

-- 16. Grant permissions
GRANT SELECT ON graph.file_processing_status TO postgres;
GRANT EXECUTE ON FUNCTION get_file_processing_stats() TO postgres;
