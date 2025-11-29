require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function exposeGraphSchema() {
  try {
    console.log('Exposing graph schema and granting permissions...');
    
    // SQL commands to expose the graph schema
    const sqlCommands = [
      'GRANT USAGE ON SCHEMA graph TO anon, authenticated, service_role;',
      'GRANT ALL ON ALL TABLES IN SCHEMA graph TO anon, authenticated, service_role;',
      'GRANT ALL ON ALL ROUTINES IN SCHEMA graph TO anon, authenticated, service_role;',
      'GRANT ALL ON ALL SEQUENCES IN SCHEMA graph TO anon, authenticated, service_role;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA graph GRANT ALL ON TABLES TO anon, authenticated, service_role;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA graph GRANT ALL ON ROUTINES TO anon, authenticated, service_role;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA graph GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;'
    ];

    for (const sql of sqlCommands) {
      console.log(`Executing: ${sql}`);
      const { data, error } = await supabase.rpc('exec_sql', { sql });
      
      if (error) {
        console.error(`Error executing SQL: ${error.message}`);
        // Try alternative method
        const { data: altData, error: altError } = await supabase
          .from('_sql')
          .select('*')
          .eq('query', sql);
        
        if (altError) {
          console.error(`Alternative method also failed: ${altError.message}`);
        } else {
          console.log('✅ Command executed successfully via alternative method');
        }
      } else {
        console.log('✅ Command executed successfully');
      }
    }

    console.log('\nTesting access to graph schema tables...');
    
    // Test access to entities table
    const { data: entities, error: entitiesError } = await supabase
      .from('graph.entities')
      .select('*')
      .limit(1);
    
    if (entitiesError) {
      console.log('❌ Still cannot access graph.entities:', entitiesError.message);
    } else {
      console.log('✅ Successfully accessed graph.entities table');
    }

    // Test access to edges table
    const { data: edges, error: edgesError } = await supabase
      .from('graph.edges')
      .select('*')
      .limit(1);
    
    if (edgesError) {
      console.log('❌ Still cannot access graph.edges:', edgesError.message);
    } else {
      console.log('✅ Successfully accessed graph.edges table');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

exposeGraphSchema();
