-- Add Affinity ID to entities if missing
ALTER TABLE graph.entities 
ADD COLUMN IF NOT EXISTS affinity_id INTEGER,
ADD COLUMN IF NOT EXISTS affinity_data JSONB;

CREATE INDEX IF NOT EXISTS idx_entities_affinity_id ON graph.entities(affinity_id);

-- Create Interactions Table (Notes, Meetings, Emails)
CREATE TABLE IF NOT EXISTS graph.interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES graph.entities(id) ON DELETE CASCADE,
    affinity_note_id INTEGER, -- External ID
    type TEXT NOT NULL, -- 'note', 'meeting', 'email', 'call'
    content TEXT,
    summary TEXT, -- AI generated summary
    author_name TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    embedding vector(2000), -- For semantic search over notes
    risk_flags TEXT[], -- AI extracted
    key_themes TEXT[] -- AI extracted
);

CREATE INDEX IF NOT EXISTS idx_interactions_entity_id ON graph.interactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_interactions_embedding ON graph.interactions USING ivfflat (embedding vector_cosine_ops);

-- Sync State Table
CREATE TABLE IF NOT EXISTS graph.sync_state (
    source TEXT PRIMARY KEY, -- 'affinity', 'crunchbase', etc.
    last_synced_at TIMESTAMP WITH TIME ZONE,
    cursor TEXT,
    status TEXT
);

-- Performance Metrics (JSONB is okay for sparse data, but let's add a few structured ones for filtering)
ALTER TABLE graph.entities
ADD COLUMN IF NOT EXISTS revenue_millions DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS revenue_growth_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS gross_margin_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS net_retention_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS churn_percent DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS cash_runway_months INTEGER,
ADD COLUMN IF NOT EXISTS last_metric_date DATE;

