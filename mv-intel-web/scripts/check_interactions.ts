import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Look for .env.local in the parent directory of scripts/
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('Checking embedding column...');
  
  try {
      // Attempt to select embedding
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
