-- Add vector search capabilities to existing interactions table
ALTER TABLE graph.interactions
ADD COLUMN IF NOT EXISTS embedding vector(2000),
ADD COLUMN IF NOT EXISTS risk_flags TEXT[],
ADD COLUMN IF NOT EXISTS key_themes TEXT[];

CREATE INDEX IF NOT EXISTS idx_interactions_embedding ON graph.interactions USING ivfflat (embedding vector_cosine_ops);

-- Ensure we have performance metrics on entities (this part of previous script succeeded, but repeating IF NOT EXISTS is safe)
ALTER TABLE graph.entities
ADD COLUMN IF NOT EXISTS revenue_millions DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS revenue_growth_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS gross_margin_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS net_retention_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS churn_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS cash_runway_months INTEGER,
ADD COLUMN IF NOT EXISTS last_metric_date DATE;

