ALTER TABLE graph.entities
ADD COLUMN IF NOT EXISTS taxonomy_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS taxonomy_reasoning TEXT,
ADD COLUMN IF NOT EXISTS taxonomy_secondary TEXT[],
ADD COLUMN IF NOT EXISTS business_analysis JSONB,
ADD COLUMN IF NOT EXISTS webpage_content TEXT,
ADD COLUMN IF NOT EXISTS webpage_fetched_at TIMESTAMP;

