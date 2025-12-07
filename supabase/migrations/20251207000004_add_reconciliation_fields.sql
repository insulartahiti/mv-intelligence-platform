-- Add columns for reconciliation and audit
ALTER TABLE fact_financials 
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS explanation text,
ADD COLUMN IF NOT EXISTS changelog jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS snippet_url text;

-- Add unique constraint for upserting reconciled facts
-- We want one record per (company, date, scenario, line_item)
-- If we have multiple sources, the reconciliation logic decides which one wins and updates this single record
-- Using coalesce on scenario to handle nulls if any (though default is 'Actual')
CREATE UNIQUE INDEX IF NOT EXISTS idx_fact_financials_unique_key 
ON fact_financials (company_id, date, scenario, line_item_id);

-- Add snippet_url to fact_metrics for easier UI access
ALTER TABLE fact_metrics
ADD COLUMN IF NOT EXISTS snippet_url text;

