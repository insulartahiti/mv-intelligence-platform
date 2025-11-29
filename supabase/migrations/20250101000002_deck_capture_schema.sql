-- ============================================================================
-- DECK CAPTURE PIPELINE SCHEMA
-- ============================================================================
-- This migration creates the core tables for the deck capture pipeline
-- Raw files are stored in Affinity, analysis/intelligence in Supabase

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Add new columns to existing artifacts table
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS source_platform TEXT;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS affinity_deal_id TEXT;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS affinity_org_id TEXT;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS capture_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add new columns to existing slides table
ALTER TABLE slides ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE slides ADD COLUMN IF NOT EXISTS content_summary TEXT;
ALTER TABLE slides ADD COLUMN IF NOT EXISTS slide_type TEXT;
ALTER TABLE slides ADD COLUMN IF NOT EXISTS visual_elements JSONB DEFAULT '[]';
ALTER TABLE slides ADD COLUMN IF NOT EXISTS layout_analysis JSONB DEFAULT '{}';
ALTER TABLE slides ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) DEFAULT 0.0;
ALTER TABLE slides ADD COLUMN IF NOT EXISTS affinity_file_id TEXT;
ALTER TABLE slides ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Content analysis table - detailed intelligence from slides
CREATE TABLE IF NOT EXISTS content_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slide_id UUID NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL, -- 'text_extraction', 'chart_analysis', 'table_data', 'image_description'
  content_data JSONB NOT NULL, -- Structured analysis data
  extracted_entities JSONB DEFAULT '[]', -- Named entities, companies, people, dates
  sentiment_score DECIMAL(3,2), -- Sentiment analysis (-1 to 1)
  topics TEXT[], -- Detected topics/themes
  keywords TEXT[], -- Important keywords
  confidence_score DECIMAL(3,2) DEFAULT 0.0,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Intelligence insights table - aggregated knowledge graph data
CREATE TABLE IF NOT EXISTS intelligence_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artifact_id UUID REFERENCES artifacts(id) ON DELETE CASCADE,
  slide_id UUID REFERENCES slides(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL, -- 'company_mention', 'financial_data', 'market_trend', 'competitive_analysis'
  insight_data JSONB NOT NULL, -- Structured insight data
  relevance_score DECIMAL(3,2) DEFAULT 0.0,
  source_slide INTEGER, -- Slide number where insight was found
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  verified BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Artifacts indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_source_platform ON artifacts(source_platform);
CREATE INDEX IF NOT EXISTS idx_artifacts_affinity_org_id ON artifacts(affinity_org_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_capture_date ON artifacts(capture_date DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_title_gin ON artifacts USING GIN(to_tsvector('english', title));

-- Slides indexes
CREATE INDEX IF NOT EXISTS idx_slides_artifact_id ON slides(artifact_id);
CREATE INDEX IF NOT EXISTS idx_slides_slide_number ON slides(artifact_id, slide_number);
CREATE INDEX IF NOT EXISTS idx_slides_text_content_gin ON slides USING GIN(to_tsvector('english', text_content));
CREATE INDEX IF NOT EXISTS idx_slides_slide_type ON slides(slide_type);

-- Content analysis indexes
CREATE INDEX IF NOT EXISTS idx_content_analysis_slide_id ON content_analysis(slide_id);
CREATE INDEX IF NOT EXISTS idx_content_analysis_type ON content_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS idx_content_analysis_entities_gin ON content_analysis USING GIN(extracted_entities);

-- Intelligence insights indexes
CREATE INDEX IF NOT EXISTS idx_intelligence_insights_artifact_id ON intelligence_insights(artifact_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_insights_type ON intelligence_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_insights_relevance ON intelligence_insights(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_insights_tags_gin ON intelligence_insights USING GIN(tags);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies (basic - can be enhanced later)
CREATE POLICY "Users can view their own organization's artifacts" ON artifacts
  FOR SELECT USING (affinity_org_id = current_setting('app.affinity_org_id', true)::TEXT);

CREATE POLICY "Users can view their own organization's slides" ON slides
  FOR SELECT USING (
    artifact_id IN (
      SELECT id FROM artifacts WHERE affinity_org_id = current_setting('app.affinity_org_id', true)::TEXT
    )
  );

CREATE POLICY "Users can view their own organization's content analysis" ON content_analysis
  FOR SELECT USING (
    slide_id IN (
      SELECT s.id FROM slides s 
      JOIN artifacts a ON s.artifact_id = a.id 
      WHERE a.affinity_org_id = current_setting('app.affinity_org_id', true)::TEXT
    )
  );

CREATE POLICY "Users can view their own organization's intelligence insights" ON intelligence_insights
  FOR SELECT USING (
    artifact_id IN (
      SELECT id FROM artifacts WHERE affinity_org_id = current_setting('app.affinity_org_id', true)::TEXT
    )
  );

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_artifacts_updated_at BEFORE UPDATE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_slides_updated_at BEFORE UPDATE ON slides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate artifact statistics
CREATE OR REPLACE FUNCTION calculate_artifact_stats(artifact_uuid UUID)
RETURNS TABLE(
  total_slides INTEGER,
  processed_slides INTEGER,
  avg_confidence DECIMAL(3,2),
  insight_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(s.id)::INTEGER as total_slides,
    COUNT(CASE WHEN s.text_content IS NOT NULL THEN 1 END)::INTEGER as processed_slides,
    AVG(s.confidence_score) as avg_confidence,
    COUNT(i.id)::INTEGER as insight_count
  FROM artifacts a
  LEFT JOIN slides s ON a.id = s.artifact_id
  LEFT JOIN intelligence_insights i ON a.id = i.artifact_id
  WHERE a.id = artifact_uuid
  GROUP BY a.id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA (for development)
-- ============================================================================

-- Note: No sample data inserted - system will be populated with real data through:
-- 1. Deck capture functionality
-- 2. Affinity API integration
-- 3. Email processing system
-- 4. User interactions

COMMENT ON TABLE artifacts IS 'Stores metadata about captured presentations, raw files stored in Affinity';
COMMENT ON TABLE slides IS 'Individual slide data and analysis from captured presentations';
COMMENT ON TABLE content_analysis IS 'Detailed intelligence extracted from slide content';
COMMENT ON TABLE intelligence_insights IS 'Aggregated knowledge graph insights from artifact analysis';
