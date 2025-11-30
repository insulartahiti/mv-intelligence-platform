-- Fix missing columns required by Affinity Sync
ALTER TABLE graph.interactions
ADD COLUMN IF NOT EXISTS content_full TEXT,
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_sentiment TEXT,
ADD COLUMN IF NOT EXISTS ai_key_points TEXT[],
ADD COLUMN IF NOT EXISTS ai_action_items TEXT[],
ADD COLUMN IF NOT EXISTS ai_risk_flags TEXT[],
ADD COLUMN IF NOT EXISTS ai_themes TEXT[];

