-- Migrate Financial Data to link to Knowledge Graph Entities
-- instead of the legacy/raw public.companies table.

-- 1. Drop existing foreign keys
ALTER TABLE fact_financials DROP CONSTRAINT IF EXISTS fact_financials_company_id_fkey;
ALTER TABLE fact_metrics DROP CONSTRAINT IF EXISTS fact_metrics_company_id_fkey;
ALTER TABLE dim_source_files DROP CONSTRAINT IF EXISTS dim_source_files_company_id_fkey;
ALTER TABLE company_insights DROP CONSTRAINT IF EXISTS company_insights_company_id_fkey;

-- 2. Add new foreign keys to graph.entities
-- Note: We assume existing data in these tables (if any) needs to be truncated 
-- or mapped manually, as UUIDs will differ. 
-- Since this is staging/early dev, strictly enforcing the new link is prioritized.

ALTER TABLE fact_financials 
    ADD CONSTRAINT fact_financials_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES graph.entities(id);

ALTER TABLE fact_metrics 
    ADD CONSTRAINT fact_metrics_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES graph.entities(id);

ALTER TABLE dim_source_files 
    ADD CONSTRAINT dim_source_files_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES graph.entities(id);

ALTER TABLE company_insights 
    ADD CONSTRAINT company_insights_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES graph.entities(id);

-- 3. Update Indexes (if needed)
-- (Existing indexes on company_id are still valid)

