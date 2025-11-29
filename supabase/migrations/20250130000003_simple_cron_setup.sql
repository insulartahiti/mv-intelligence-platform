-- Enable pg_cron extension for automated scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a simple function to call embeddings generation
CREATE OR REPLACE FUNCTION cron.generate_embeddings_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the generate-embeddings Edge Function
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/generate-embeddings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'apikey', current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"batchSize": 20, "parallel": true}'::jsonb
  );
  
  -- Log the execution
  INSERT INTO graph.sync_state (last_sync_timestamp, entities_synced, rate_limit_remaining, next_sync_allowed)
  VALUES (NOW(), 0, 300, NOW() + INTERVAL '1 hour')
  ON CONFLICT (id) DO UPDATE SET
    last_sync_timestamp = NOW(),
    entities_synced = entities_synced + 1;
END;
$$;

-- Schedule embeddings generation to run every 30 minutes
SELECT cron.schedule(
  'embeddings-generation-30min',
  '*/30 * * * *', -- Every 30 minutes
  'SELECT cron.generate_embeddings_job();'
);

-- Create a function to list cron jobs
CREATE OR REPLACE FUNCTION cron.list_scheduled_jobs()
RETURNS TABLE(
  jobid bigint,
  schedule text,
  command text,
  active boolean,
  jobname text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jobid, schedule, command, active, jobname FROM cron.job;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cron.generate_embeddings_job() TO postgres;
GRANT EXECUTE ON FUNCTION cron.list_scheduled_jobs() TO postgres;
