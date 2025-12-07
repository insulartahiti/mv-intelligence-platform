import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTaxonomy() {
  console.log('--- Checking Taxonomy Column ---');
  
  const { data: entities, error } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, taxonomy')
    .limit(1);

  if (error) {
    console.error('Error fetching entity:', error);
    return;
  }

  if (entities && entities.length > 0) {
      console.log('Sample entity taxonomy:', entities[0].taxonomy);
      console.log('Taxonomy type:', typeof entities[0].taxonomy);
  } else {
      console.log('No entities found to check.');
  }
}

checkTaxonomy();
