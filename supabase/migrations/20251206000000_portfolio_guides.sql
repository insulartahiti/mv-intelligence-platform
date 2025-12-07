
-- Table for storing editable Portco Guides (YAML configs)
-- This replaces the static filesystem guides for production use
CREATE TABLE IF NOT EXISTS portfolio_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES graph.entities(id) ON DELETE CASCADE,
  content_yaml TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Enforce one active guide per company (we can support history later via separate table)
  UNIQUE(company_id)
);

-- RLS
ALTER TABLE portfolio_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view portfolio guides" ON portfolio_guides
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can update portfolio guides" ON portfolio_guides
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert portfolio guides" ON portfolio_guides
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

