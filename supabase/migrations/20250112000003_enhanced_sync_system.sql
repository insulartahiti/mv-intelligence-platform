-- Enhanced Sync System Schema Updates
-- This adds webhook logging and enhanced sync state tracking

-- Create webhook logs table for tracking webhook events
CREATE TABLE IF NOT EXISTS graph.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id text NOT NULL,
  event_type text NOT NULL,
  entity_id text NOT NULL,
  processed boolean DEFAULT false,
  result jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create index for webhook logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type ON graph.webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_entity_id ON graph.webhook_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON graph.webhook_logs(created_at);

-- Update sync_state table with enhanced fields
ALTER TABLE graph.sync_state ADD COLUMN IF NOT EXISTS last_incremental_sync timestamp with time zone;
ALTER TABLE graph.sync_state ADD COLUMN IF NOT EXISTS sync_type text DEFAULT 'incremental' CHECK (sync_type IN ('full', 'incremental'));
ALTER TABLE graph.sync_state ADD COLUMN IF NOT EXISTS webhook_events_processed integer DEFAULT 0;
ALTER TABLE graph.sync_state ADD COLUMN IF NOT EXISTS last_webhook_event timestamp with time zone;

-- Create sync performance metrics table
CREATE TABLE IF NOT EXISTS graph.sync_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL CHECK (sync_type IN ('full', 'incremental', 'webhook')),
  entities_processed integer DEFAULT 0,
  entities_created integer DEFAULT 0,
  entities_updated integer DEFAULT 0,
  entities_unchanged integer DEFAULT 0,
  processing_time_ms integer,
  rate_limit_remaining integer,
  error_count integer DEFAULT 0,
  sync_timestamp timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Create indexes for sync metrics
CREATE INDEX IF NOT EXISTS idx_sync_metrics_sync_type ON graph.sync_metrics(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_metrics_sync_timestamp ON graph.sync_metrics(sync_timestamp);

-- Create change tracking table for detailed change history
CREATE TABLE IF NOT EXISTS graph.entity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES graph.entities(id),
  entity_type text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted')),
  changed_fields text[],
  old_values jsonb,
  new_values jsonb,
  source text NOT NULL CHECK (source IN ('affinity_api_sync', 'affinity_webhook', 'manual')),
  sync_timestamp timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Create indexes for entity changes
CREATE INDEX IF NOT EXISTS idx_entity_changes_entity_id ON graph.entity_changes(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_changes_entity_type ON graph.entity_changes(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_changes_change_type ON graph.entity_changes(change_type);
CREATE INDEX IF NOT EXISTS idx_entity_changes_sync_timestamp ON graph.entity_changes(sync_timestamp);

-- Create function to log entity changes
CREATE OR REPLACE FUNCTION graph.log_entity_change(
  p_entity_id uuid,
  p_entity_type text,
  p_change_type text,
  p_changed_fields text[],
  p_old_values jsonb,
  p_new_values jsonb,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO graph.entity_changes (
    entity_id,
    entity_type,
    change_type,
    changed_fields,
    old_values,
    new_values,
    source
  ) VALUES (
    p_entity_id,
    p_entity_type,
    p_change_type,
    p_changed_fields,
    p_old_values,
    p_new_values,
    p_source
  );
END;
$$;

-- Create function to get sync statistics
CREATE OR REPLACE FUNCTION graph.get_sync_statistics(
  p_days integer DEFAULT 7
)
RETURNS TABLE (
  sync_type text,
  total_syncs bigint,
  total_entities_processed bigint,
  total_entities_created bigint,
  total_entities_updated bigint,
  avg_processing_time_ms numeric,
  avg_rate_limit_remaining numeric,
  total_errors bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    sm.sync_type,
    COUNT(*) as total_syncs,
    SUM(sm.entities_processed) as total_entities_processed,
    SUM(sm.entities_created) as total_entities_created,
    SUM(sm.entities_updated) as total_entities_updated,
    AVG(sm.processing_time_ms) as avg_processing_time_ms,
    AVG(sm.rate_limit_remaining) as avg_rate_limit_remaining,
    SUM(sm.error_count) as total_errors
  FROM graph.sync_metrics sm
  WHERE sm.sync_timestamp >= NOW() - INTERVAL '1 day' * p_days
  GROUP BY sm.sync_type
  ORDER BY sm.sync_type;
$$;

-- Create function to get entity change history
CREATE OR REPLACE FUNCTION graph.get_entity_change_history(
  p_entity_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  change_type text,
  changed_fields text[],
  old_values jsonb,
  new_values jsonb,
  source text,
  sync_timestamp timestamp with time zone
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    ec.change_type,
    ec.changed_fields,
    ec.old_values,
    ec.new_values,
    ec.source,
    ec.sync_timestamp
  FROM graph.entity_changes ec
  WHERE ec.entity_id = p_entity_id
  ORDER BY ec.sync_timestamp DESC
  LIMIT p_limit;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION graph.log_entity_change TO authenticated;
GRANT EXECUTE ON FUNCTION graph.get_sync_statistics TO authenticated;
GRANT EXECUTE ON FUNCTION graph.get_entity_change_history TO authenticated;

-- Create RLS policies for new tables
ALTER TABLE graph.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.sync_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph.entity_changes ENABLE ROW LEVEL SECURITY;

-- Webhook logs policies
CREATE POLICY "Service role can manage webhook logs" ON graph.webhook_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read webhook logs" ON graph.webhook_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Sync metrics policies
CREATE POLICY "Service role can manage sync metrics" ON graph.sync_metrics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read sync metrics" ON graph.sync_metrics
  FOR SELECT USING (auth.role() = 'authenticated');

-- Entity changes policies
CREATE POLICY "Service role can manage entity changes" ON graph.entity_changes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read entity changes" ON graph.entity_changes
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create views for easier access
CREATE OR REPLACE VIEW public.webhook_logs_view AS
SELECT 
  id,
  webhook_id,
  event_type,
  entity_id,
  processed,
  result,
  error_message,
  created_at,
  updated_at
FROM graph.webhook_logs;

CREATE OR REPLACE VIEW public.sync_metrics_view AS
SELECT 
  id,
  sync_type,
  entities_processed,
  entities_created,
  entities_updated,
  entities_unchanged,
  processing_time_ms,
  rate_limit_remaining,
  error_count,
  sync_timestamp,
  created_at
FROM graph.sync_metrics;

CREATE OR REPLACE VIEW public.entity_changes_view AS
SELECT 
  id,
  entity_id,
  entity_type,
  change_type,
  changed_fields,
  old_values,
  new_values,
  source,
  sync_timestamp,
  created_at
FROM graph.entity_changes;
