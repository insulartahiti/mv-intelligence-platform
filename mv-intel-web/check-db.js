require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkDatabase() {
  try {
    console.log('Checking database connection...');
    
    // Test basic connection with companies table
    const { data, error } = await supabase
      .from('companies')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database connection error:', error);
      return;
    }
    
    console.log('✅ Database connection successful');
    
    // Check entities table in graph schema using schema method
    const { data: entities, error: entitiesError } = await supabase
      .schema('graph')
      .from('entities')
      .select('*')
      .limit(1);
    
    if (entitiesError) {
      console.log('❌ graph.entities table:', entitiesError.message);
    } else {
      console.log('✅ graph.entities table: accessible, count:', entities?.length || 0);
      if (entities && entities.length > 0) {
        console.log('Sample entity:', entities[0]);
      } else {
        console.log('Entities table is empty.');
      }
    }
    
    // Check edges table in graph schema using schema method
    const { data: edges, error: edgesError } = await supabase
      .schema('graph')
      .from('edges')
      .select('*')
      .limit(1);
    
    if (edgesError) {
      console.log('❌ graph.edges table:', edgesError.message);
    } else {
      console.log('✅ graph.edges table: accessible, count:', edges?.length || 0);
      if (edges && edges.length > 0) {
        console.log('Sample edge:', edges[0]);
      } else {
        console.log('Edges table is empty.');
      }
    }
    
    // List all available tables by trying common table names
    const tables = ['companies', 'contacts', 'profiles', 'artifacts', 'slides', 'metrics', 'edges', 'relationships'];
    console.log('\nChecking available tables:');
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('count')
        .limit(1);
      
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: accessible`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkDatabase();
