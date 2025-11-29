-- Migration to simple schema without org requirements
-- Drop existing org-based tables and create simple ones

-- Drop existing tables (in reverse dependency order)
DROP TABLE IF EXISTS embeddings CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS metrics CASCADE;
DROP TABLE IF EXISTS slides CASCADE;
DROP TABLE IF EXISTS artifacts CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS orgs CASCADE;

-- Create simple schema
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
  artifact_id uuid NOT NULL REFERENCES artifacts(id),
  slide_number integer NOT NULL,
  image_url text,
  text_content text,
  created_at timestamptz DEFAULT now()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS artifacts_created_by_idx ON artifacts(created_by);
CREATE INDEX IF NOT EXISTS slides_artifact_id_idx ON slides(artifact_id);

-- Enable RLS on simple tables
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies (allow all authenticated users)
CREATE POLICY artifacts_all ON artifacts FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY slides_all ON slides FOR ALL USING (auth.uid() IS NOT NULL);
