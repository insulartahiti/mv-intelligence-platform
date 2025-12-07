CREATE TABLE IF NOT EXISTS legal_config (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE legal_config ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Drop policies if they exist to avoid error
    DROP POLICY IF EXISTS "Allow public read access" ON legal_config;
    DROP POLICY IF EXISTS "Allow service role write access" ON legal_config;
    
    CREATE POLICY "Allow public read access" ON legal_config FOR SELECT USING (true);
    CREATE POLICY "Allow service role write access" ON legal_config FOR ALL USING (true);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

