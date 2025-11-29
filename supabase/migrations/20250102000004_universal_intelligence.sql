-- Universal Intelligence Table
-- Stores GPT-5 generated intelligence across all entity types

CREATE TABLE IF NOT EXISTS universal_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('company', 'contact', 'interaction', 'opportunity', 'file')),
  entity_id uuid NOT NULL,
  intelligence_type text DEFAULT 'comprehensive',
  insights jsonb NOT NULL,
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  -- Ensure one intelligence record per entity
  UNIQUE(entity_type, entity_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS universal_intelligence_entity_type_idx ON universal_intelligence(entity_type);
CREATE INDEX IF NOT EXISTS universal_intelligence_entity_id_idx ON universal_intelligence(entity_id);
CREATE INDEX IF NOT EXISTS universal_intelligence_confidence_score_idx ON universal_intelligence(confidence_score);
CREATE INDEX IF NOT EXISTS universal_intelligence_last_updated_idx ON universal_intelligence(last_updated);
CREATE INDEX IF NOT EXISTS universal_intelligence_entity_lookup_idx ON universal_intelligence(entity_type, entity_id);

-- RLS policies
ALTER TABLE universal_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS universal_intelligence_all ON universal_intelligence;
CREATE POLICY universal_intelligence_all ON universal_intelligence FOR ALL USING (true);

-- Function to update intelligence timestamp
CREATE OR REPLACE FUNCTION update_universal_intelligence_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update timestamp
DROP TRIGGER IF EXISTS universal_intelligence_update_timestamp ON universal_intelligence;
CREATE TRIGGER universal_intelligence_update_timestamp
  BEFORE UPDATE ON universal_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION update_universal_intelligence_timestamp();

-- Function to get intelligence for any entity
CREATE OR REPLACE FUNCTION get_entity_intelligence(entity_type_param text, entity_id_param uuid)
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  intelligence_type text,
  insights jsonb,
  confidence_score numeric,
  last_updated timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ui.entity_type,
    ui.entity_id,
    ui.intelligence_type,
    ui.insights,
    ui.confidence_score,
    ui.last_updated
  FROM universal_intelligence ui
  WHERE ui.entity_type = entity_type_param 
    AND ui.entity_id = entity_id_param;
END;
$$ LANGUAGE plpgsql;

-- Function to get top entities by intelligence confidence
CREATE OR REPLACE FUNCTION get_top_intelligent_entities(entity_type_param text DEFAULT NULL, limit_count integer DEFAULT 10)
RETURNS TABLE (
  entity_type text,
  entity_id uuid,
  entity_name text,
  confidence_score numeric,
  key_insight text,
  last_updated timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ui.entity_type,
    ui.entity_id,
    CASE 
      WHEN ui.entity_type = 'company' THEN c.name
      WHEN ui.entity_type = 'contact' THEN co.name
      WHEN ui.entity_type = 'interaction' THEN i.subject
      WHEN ui.entity_type = 'opportunity' THEN o.name
      WHEN ui.entity_type = 'file' THEN a.title
      ELSE 'Unknown'
    END as entity_name,
    ui.confidence_score,
    CASE 
      WHEN ui.entity_type = 'company' THEN ui.insights->>'market_position'
      WHEN ui.entity_type = 'contact' THEN ui.insights->>'context'
      WHEN ui.entity_type = 'interaction' THEN ui.insights->>'sentiment'
      WHEN ui.entity_type = 'opportunity' THEN ui.insights->>'probability'::text
      WHEN ui.entity_type = 'file' THEN ui.insights->>'content_summary'
      ELSE 'No insight available'
    END as key_insight,
    ui.last_updated
  FROM universal_intelligence ui
  LEFT JOIN companies c ON ui.entity_type = 'company' AND ui.entity_id = c.id
  LEFT JOIN contacts co ON ui.entity_type = 'contact' AND ui.entity_id = co.id
  LEFT JOIN interactions i ON ui.entity_type = 'interaction' AND ui.entity_id = i.id
  LEFT JOIN opportunities o ON ui.entity_type = 'opportunity' AND ui.entity_id = o.id
  LEFT JOIN artifacts a ON ui.entity_type = 'file' AND ui.entity_id = a.id
  WHERE (entity_type_param IS NULL OR ui.entity_type = entity_type_param)
  ORDER BY ui.confidence_score DESC, ui.last_updated DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
