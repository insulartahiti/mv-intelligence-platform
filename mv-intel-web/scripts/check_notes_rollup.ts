import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), 'mv-intel-web/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  console.log('Checking entity_notes_rollup table structure...');
  
  // Try public schema first
  const { data: publicData, error: publicError } = await supabase
    .from('entity_notes_rollup')
    .select('*')
    .limit(1);

  if (publicError) {
      console.log('Public schema error:', publicError.message);
  } else {
      console.log('Public schema columns:', publicData && publicData.length > 0 ? Object.keys(publicData[0]) : 'Table empty but exists');
  }
}

checkTable();
