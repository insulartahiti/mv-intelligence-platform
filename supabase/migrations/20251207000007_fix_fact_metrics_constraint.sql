
-- Fix missing unique constraint on fact_metrics
-- This is required for the upsert in compute_metrics.ts which references 'fact_metrics_company_period_metric_key'

-- First, ensure we don't have duplicates that would block the constraint
-- (Optional cleanup if this was a real production issue with data, but for staging we can just try to add it)

-- Drop the constraint if it exists under a different name or the same name
ALTER TABLE fact_metrics DROP CONSTRAINT IF EXISTS fact_metrics_company_period_metric_key;
ALTER TABLE fact_metrics DROP CONSTRAINT IF EXISTS fact_metrics_company_id_period_metric_id_key;

-- Add the constraint explicitly named as expected by the codebase
ALTER TABLE fact_metrics 
ADD CONSTRAINT fact_metrics_company_period_metric_key 
UNIQUE (company_id, period, metric_id);
