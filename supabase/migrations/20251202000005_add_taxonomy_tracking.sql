-- Add taxonomy tracking columns to graph.entities
-- Used by enhanced_embedding_generator.js to skip unclassifiable entities

ALTER TABLE graph.entities 
ADD COLUMN IF NOT EXISTS taxonomy_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS taxonomy_skip_until timestamptz;

-- Index for performance (since we filter by skip date)
CREATE INDEX IF NOT EXISTS idx_entities_taxonomy_skip ON graph.entities(taxonomy_skip_until);

