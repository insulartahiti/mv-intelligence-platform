-- Add taxonomy_embedding column (vector 2000) to entities table
ALTER TABLE graph.entities ADD COLUMN IF NOT EXISTS taxonomy_embedding vector(2000);

-- Create a table to track embedding progress
CREATE TABLE IF NOT EXISTS embedding_status (
  entity_id uuid PRIMARY KEY,
  last_attempt timestamp NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('pending','completed','failed')),
  attempts int NOT NULL DEFAULT 0,
  error_message text
);
