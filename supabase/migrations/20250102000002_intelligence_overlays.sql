-- Intelligence Overlays Table
-- Stores GPT-generated intelligence about contacts and companies

CREATE TABLE IF NOT EXISTS intelligence_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Core intelligence metrics
  relationship_strength numeric(3,2) CHECK (relationship_strength >= 0 AND relationship_strength <= 1),
  context text,
  opportunities text[],
  risk_factors text[],
  next_best_action text,
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Detailed insights
  insights jsonb,
  
  -- Metadata
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one overlay per contact
  UNIQUE(contact_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS intelligence_overlays_contact_id_idx ON intelligence_overlays(contact_id);
CREATE INDEX IF NOT EXISTS intelligence_overlays_company_id_idx ON intelligence_overlays(company_id);
CREATE INDEX IF NOT EXISTS intelligence_overlays_relationship_strength_idx ON intelligence_overlays(relationship_strength);
CREATE INDEX IF NOT EXISTS intelligence_overlays_last_updated_idx ON intelligence_overlays(last_updated);

-- RLS policies
ALTER TABLE intelligence_overlays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intelligence_overlays_all ON intelligence_overlays;
CREATE POLICY intelligence_overlays_all ON intelligence_overlays FOR ALL USING (true);

-- Function to update intelligence overlay timestamp
CREATE OR REPLACE FUNCTION update_intelligence_overlay_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update timestamp
DROP TRIGGER IF EXISTS intelligence_overlays_update_timestamp ON intelligence_overlays;
CREATE TRIGGER intelligence_overlays_update_timestamp
  BEFORE UPDATE ON intelligence_overlays
  FOR EACH ROW
  EXECUTE FUNCTION update_intelligence_overlay_timestamp();

-- Function to get intelligence overlay for a contact
CREATE OR REPLACE FUNCTION get_contact_intelligence(contact_uuid uuid)
RETURNS TABLE (
  contact_id uuid,
  relationship_strength numeric,
  context text,
  opportunities text[],
  risk_factors text[],
  next_best_action text,
  confidence_score numeric,
  insights jsonb,
  last_updated timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    io.contact_id,
    io.relationship_strength,
    io.context,
    io.opportunities,
    io.risk_factors,
    io.next_best_action,
    io.confidence_score,
    io.insights,
    io.last_updated
  FROM intelligence_overlays io
  WHERE io.contact_id = contact_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to get top relationships by strength
CREATE OR REPLACE FUNCTION get_top_relationships(limit_count integer DEFAULT 10)
RETURNS TABLE (
  contact_id uuid,
  contact_name text,
  company_name text,
  relationship_strength numeric,
  context text,
  next_best_action text,
  last_updated timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    io.contact_id,
    c.name as contact_name,
    co.name as company_name,
    io.relationship_strength,
    io.context,
    io.next_best_action,
    io.last_updated
  FROM intelligence_overlays io
  JOIN contacts c ON c.id = io.contact_id
  JOIN companies co ON co.id = c.company_id
  ORDER BY io.relationship_strength DESC, io.last_updated DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
