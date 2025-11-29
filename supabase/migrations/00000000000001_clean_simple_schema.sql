-- Clean simple schema migration - start fresh
-- This replaces all previous complex migrations

-- Drop all existing tables to start clean
DROP TABLE IF EXISTS embeddings CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS metrics CASCADE;
DROP TABLE IF EXISTS slides CASCADE;
DROP TABLE IF EXISTS artifacts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS orgs CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS news_items CASCADE;
DROP TABLE IF EXISTS company_watchlist CASCADE;
DROP TABLE IF EXISTS company_snapshots CASCADE;
DROP TABLE IF EXISTS relationships CASCADE;

-- Create simple schema for deck capture
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  source_url text,
  storage_path text,
  title text,
  created_by uuid,
  status text DEFAULT 'CAPTURING',
  slide_count integer,
  pdf_path text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  slide_number integer NOT NULL,
  image_url text,
  text_content text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS artifacts_created_by_idx ON artifacts(created_by);
CREATE INDEX IF NOT EXISTS slides_artifact_id_idx ON slides(artifact_id);

-- Enable RLS on tables
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies (allow all authenticated users)
CREATE POLICY artifacts_all ON artifacts FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY slides_all ON slides FOR ALL USING (auth.uid() IS NOT NULL);
