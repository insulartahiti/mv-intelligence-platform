
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: entities, error } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, is_portfolio, domain')
    .ilike('name', '%Nelly%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Entities found:', JSON.stringify(entities, null, 2));
}

main();

