-- Batch Run Metadata Table
-- Tracks when batch operations were last run

CREATE TABLE IF NOT EXISTS batch_run_metadata (
  id text PRIMARY KEY,
  last_run timestamptz DEFAULT now(),
  status text DEFAULT 'pending',
  details jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS batch_run_metadata_last_run_idx ON batch_run_metadata(last_run);

-- RLS policies
ALTER TABLE batch_run_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_run_metadata_all ON batch_run_metadata;
CREATE POLICY batch_run_metadata_all ON batch_run_metadata FOR ALL USING (true);

-- Function to update batch run timestamp
CREATE OR REPLACE FUNCTION update_batch_run_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update timestamp
DROP TRIGGER IF EXISTS batch_run_metadata_update_timestamp ON batch_run_metadata;
CREATE TRIGGER batch_run_metadata_update_timestamp
  BEFORE UPDATE ON batch_run_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_run_timestamp();

-- Insert initial batch run records
INSERT INTO batch_run_metadata (id, status) VALUES 
  ('intelligence_update', 'never_run'),
  ('affinity_sync', 'never_run'),
  ('relationship_scoring', 'never_run')
ON CONFLICT (id) DO NOTHING;
