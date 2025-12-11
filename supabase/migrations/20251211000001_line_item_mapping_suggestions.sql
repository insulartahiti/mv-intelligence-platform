-- Line item mapping suggestions table
-- Stores LLM-suggested canonical mappings for unknown line items during ingestion
-- These can be reviewed and approved/rejected, then merged into the portfolio guide

CREATE TABLE IF NOT EXISTS line_item_mapping_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Which company this suggestion is for
  company_id UUID NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
  
  -- The original line item name as extracted
  original_name TEXT NOT NULL,
  
  -- LLM's suggested canonical name
  suggested_canonical TEXT NOT NULL,
  
  -- Confidence score from LLM (0-1)
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  
  -- LLM's reasoning for the suggestion
  reasoning TEXT,
  
  -- Status: pending, approved, rejected, auto_approved
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  
  -- Which source file triggered this suggestion
  source_file_id UUID REFERENCES dim_source_files(id) ON DELETE SET NULL,
  
  -- Review tracking
  reviewed_by TEXT,  -- email or user identifier
  reviewed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Avoid duplicate suggestions for same original name per company
  UNIQUE(company_id, original_name)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_line_item_suggestions_company ON line_item_mapping_suggestions(company_id);
CREATE INDEX IF NOT EXISTS idx_line_item_suggestions_status ON line_item_mapping_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_line_item_suggestions_company_status ON line_item_mapping_suggestions(company_id, status);

-- RLS policies
ALTER TABLE line_item_mapping_suggestions ENABLE ROW LEVEL SECURITY;

-- Allow read access
CREATE POLICY "Allow read access to all" ON line_item_mapping_suggestions
  FOR SELECT USING (true);

-- Allow insert/update for authenticated users and service role
CREATE POLICY "Allow write access" ON line_item_mapping_suggestions
  FOR ALL USING (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_line_item_suggestions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_line_item_suggestions_updated_at
  BEFORE UPDATE ON line_item_mapping_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_line_item_suggestions_updated_at();

-- Comment
COMMENT ON TABLE line_item_mapping_suggestions IS 'Stores LLM-suggested canonical mappings for line items discovered during financial ingestion';
