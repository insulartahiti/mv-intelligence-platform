-- Add unique constraint to fact_metrics for upsert support
alter table fact_metrics
add constraint fact_metrics_company_period_metric_key unique (company_id, period, metric_id);

