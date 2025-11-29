-- Create sync_state table for tracking Affinity sync progress
CREATE TABLE IF NOT EXISTS graph.sync_state (
  id SERIAL PRIMARY KEY,
  last_sync_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  entities_synced INTEGER DEFAULT 0,
  rate_limit_remaining INTEGER DEFAULT 300,
  next_sync_allowed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  current_batch INTEGER DEFAULT 0,
  total_batches INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default row if none exists
INSERT INTO graph.sync_state (id, last_sync_timestamp, entities_synced, rate_limit_remaining, next_sync_allowed)
VALUES (gen_random_uuid(), '1970-01-01T00:00:00Z', 0, 300, NOW())
ON CONFLICT (id) DO NOTHING;

-- Add RLS policy
ALTER TABLE graph.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role to manage sync state" ON graph.sync_state
  FOR ALL USING (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sync_state_updated_at') THEN
        CREATE TRIGGER update_sync_state_updated_at 
          BEFORE UPDATE ON graph.sync_state 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
