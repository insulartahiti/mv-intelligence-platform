
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function createTable() {
  console.log('Creating legal_config table...');
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase env vars');
    process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const sql = `
    CREATE TABLE IF NOT EXISTS legal_config (
      key TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    -- Enable RLS but allow public read for now or authenticated read
    ALTER TABLE legal_config ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Allow public read access" ON legal_config FOR SELECT USING (true);
    CREATE POLICY "Allow service role write access" ON legal_config FOR ALL USING (true);
  `;

  // Supabase JS client doesn't support raw SQL execution easily without RPC or special endpoints usually.
  // But if we have the service role key, we might be able to use the postgres connection if available, 
  // OR we use the REST API if we had a stored procedure.
  // 
  // However, looking at previous scripts like 'archive_root/migrate_to_neo4j.ts' or 'scripts/setup_auth.js', 
  // they seem to use supabase client.
  // 
  // If I can't run raw SQL, I'm in trouble.
  // Let's check if there is an 'execute_sql' rpc function.
  
  const { data, error } = await supabase.rpc('execute_sql', { sql_query: sql });
  
  if (error) {
    console.error('Failed to create table via RPC:', error);
    console.log('Trying alternative: You might need to run this SQL manually in Supabase Dashboard if RPC execute_sql is not enabled.');
    console.log(sql);
  } else {
    console.log('Table created successfully via RPC.');
  }
}

createTable();
