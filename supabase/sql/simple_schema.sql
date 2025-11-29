-- Simplified schema without organization requirements
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
