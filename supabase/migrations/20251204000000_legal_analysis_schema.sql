-- Migration: Legal Analysis Schema
-- Creates tables for storing legal document analysis and source attribution

-- Core analysis storage
CREATE TABLE IF NOT EXISTS legal_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES graph.entities(id),
  document_name TEXT NOT NULL,
  document_type TEXT NOT NULL,      -- e.g. 'US_SAFE', 'UK_EQUITY_BVCA_STYLE'
  jurisdiction TEXT NOT NULL,       -- e.g. 'US', 'UK', 'Continental Europe'
  analysis JSONB NOT NULL,          -- Full structured analysis (all 9 sections)
  executive_summary JSONB,          -- Array of { point: string, flag: 'GREEN'|'AMBER'|'RED' }
  flags JSONB,                      -- { economics: 'GREEN', control: 'AMBER', ... }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Source attribution: extracted terms linked to PDF page snippets
CREATE TABLE IF NOT EXISTS legal_term_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES legal_analyses(id) ON DELETE CASCADE,
  section TEXT NOT NULL,            -- e.g. 'liquidation_preference', 'anti_dilution'
  term_key TEXT NOT NULL,           -- e.g. 'multiple', 'type', 'threshold'
  extracted_value TEXT,             -- The extracted value
  page_number INT NOT NULL,
  snippet_url TEXT,                 -- Signed URL or path in 'legal-snippets' bucket
  bbox JSONB,                       -- { x, y, width, height } as % of page
  confidence FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_legal_analyses_company ON legal_analyses(company_id);
CREATE INDEX IF NOT EXISTS idx_legal_analyses_type ON legal_analyses(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_analyses_created ON legal_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_term_sources_analysis ON legal_term_sources(analysis_id);

-- Create storage bucket for legal snippets
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-snippets', 'legal-snippets', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for legal_analyses
ALTER TABLE legal_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view legal analyses" ON legal_analyses;
CREATE POLICY "Users can view legal analyses" ON legal_analyses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert legal analyses" ON legal_analyses;
CREATE POLICY "Authenticated users can insert legal analyses" ON legal_analyses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own analyses" ON legal_analyses;
CREATE POLICY "Users can update their own analyses" ON legal_analyses
  FOR UPDATE USING (created_by = auth.uid());

-- RLS Policies for legal_term_sources
ALTER TABLE legal_term_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view term sources" ON legal_term_sources;
CREATE POLICY "Users can view term sources" ON legal_term_sources
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert term sources" ON legal_term_sources;
CREATE POLICY "Authenticated users can insert term sources" ON legal_term_sources
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Storage RLS for legal-snippets bucket
DROP POLICY IF EXISTS "Anyone can view legal snippets" ON storage.objects;
CREATE POLICY "Anyone can view legal snippets" ON storage.objects
  FOR SELECT USING (bucket_id = 'legal-snippets');

DROP POLICY IF EXISTS "Authenticated users can upload legal snippets" ON storage.objects;
CREATE POLICY "Authenticated users can upload legal snippets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'legal-snippets' AND auth.role() = 'authenticated');

COMMENT ON TABLE legal_analyses IS 'Stores structured legal document analysis results for term sheets, SPAs, SHAs, SAFEs, etc.';
COMMENT ON TABLE legal_term_sources IS 'Links extracted legal terms to their source page snippets for audit trail';


