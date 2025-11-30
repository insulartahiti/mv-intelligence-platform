const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Try loading .env.local from current dir or parent
const envPath = path.resolve(__dirname, '../.env.local');
console.log('Loading env from:', envPath);
dotenv.config({ path: envPath });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL is missing');
    process.exit(1);
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('Checking embedding column...');
  try {
      const { data, error } = await supabase.schema('graph').from('interactions').select('embedding').limit(1);
      
      if (error) {
          console.error('Error selecting embedding:', error.message);
          if (error.message.includes('does not exist')) {
              console.log('Column embedding MISSING.');
          }
      } else {
          console.log('Column embedding EXISTS.');
      }
  } catch (e) {
      console.error(e);
  }
}
check();

