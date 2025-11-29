-- Add missing columns to existing relationships table for warm introductions
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS relationship_type VARCHAR(50) DEFAULT 'professional';
ALTER TABLE relationships ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_relationships_from_contact ON relationships(from_contact);
CREATE INDEX IF NOT EXISTS idx_relationships_to_contact ON relationships(to_contact);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_strength ON relationships(strength);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source);

-- Create composite index for path finding
CREATE INDEX IF NOT EXISTS idx_relationships_contact_strength ON relationships(from_contact, strength DESC);

-- Enable RLS
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "relationships_all" ON relationships;
CREATE POLICY "relationships_all" ON relationships
  FOR ALL USING (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_relationships_updated_at ON relationships;
CREATE TRIGGER trigger_update_relationships_updated_at
  BEFORE UPDATE ON relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_relationships_updated_at();

-- Add some sample relationship data
INSERT INTO relationships (from_contact, to_contact, relationship_type, strength, source, notes)
SELECT 
  c1.id as from_contact,
  c2.id as to_contact,
  CASE 
    WHEN random() < 0.3 THEN 'colleague'
    WHEN random() < 0.5 THEN 'professional'
    WHEN random() < 0.7 THEN 'acquaintance'
    WHEN random() < 0.9 THEN 'friend'
    ELSE 'mentor'
  END as relationship_type,
  (random() * 0.5 + 0.3)::NUMERIC as strength,
  'sample' as source,
  'Sample relationship for testing' as notes
FROM contacts c1
CROSS JOIN contacts c2
WHERE c1.id != c2.id
  AND random() < 0.1 -- Only create 10% of possible relationships
LIMIT 50;
