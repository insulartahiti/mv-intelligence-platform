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

async function checkSchema() {
  console.log('--- Checking graph.entities Schema ---');
  
  const { data, error } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, enrichment_data')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! enrichment_data exists.');
    console.log('Sample:', data && data.length > 0 ? JSON.stringify(data[0].enrichment_data).substring(0, 100) : 'No data');
  }
}

checkSchema();

