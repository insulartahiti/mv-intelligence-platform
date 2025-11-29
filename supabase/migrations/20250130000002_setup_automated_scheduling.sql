-- Enable pg_cron extension for automated scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on pg_cron to the service role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a function to call the sync scheduler
CREATE OR REPLACE FUNCTION cron.run_sync_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the sync-scheduler Edge Function
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/sync-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'apikey', current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule the sync to run every hour
SELECT cron.schedule(
  'sync-scheduler-hourly',
  '0 * * * *', -- Every hour at minute 0
  'SELECT cron.run_sync_scheduler();'
);

-- Schedule embeddings generation to run every 30 minutes
SELECT cron.schedule(
  'embeddings-generation-30min',
  '*/30 * * * *', -- Every 30 minutes
  'SELECT net.http_post(
    url := current_setting(''app.supabase_url'') || ''/functions/v1/generate-embeddings'',
    headers := jsonb_build_object(
      ''Authorization'', ''Bearer '' || current_setting(''app.supabase_service_role_key''),
      ''apikey'', current_setting(''app.supabase_service_role_key''),
      ''Content-Type'', ''application/json''
    ),
    body := ''{"batchSize": 20, "parallel": true}''::jsonb
  );'
);

-- Schedule file summaries generation to run every 2 hours
SELECT cron.schedule(
  'file-summaries-2hour',
  '0 */2 * * *', -- Every 2 hours
  'SELECT net.http_post(
    url := current_setting(''app.supabase_url'') || ''/functions/v1/generate-file-summaries'',
    headers := jsonb_build_object(
      ''Authorization'', ''Bearer '' || current_setting(''app.supabase_service_role_key''),
      ''apikey'', current_setting(''app.supabase_service_role_key''),
      ''Content-Type'', ''application/json''
    ),
    body := ''{"batchSize": 10}''::jsonb
  );'
);

-- Create a function to check and display cron jobs
CREATE OR REPLACE FUNCTION cron.list_jobs()
RETURNS TABLE(
  jobid bigint,
  schedule text,
  command text,
  nodename text,
  nodeport integer,
  database text,
  username text,
  active boolean,
  jobname text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM cron.job;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cron.run_sync_scheduler() TO postgres;
GRANT EXECUTE ON FUNCTION cron.list_jobs() TO postgres;
