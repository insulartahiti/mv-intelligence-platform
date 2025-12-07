import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .schema('graph')
    .from('entities')
    .select('fund')
    .eq('is_portfolio', true);
    
  const funds = [...new Set(data?.map(d => d.fund))];
  console.log('Unique funds:', funds);
}

main();
