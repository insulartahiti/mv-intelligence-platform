import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Find Aufinity entity
  const { data: entity } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name')
    .ilike('name', '%Aufinity%')
    .eq('is_portfolio', true)
    .maybeSingle();

  if (!entity) {
    console.log('❌ No portfolio entity found for Aufinity');
    return;
  }

  console.log(`Entity: ${entity.name} (${entity.id})`);

  // Get guide
  const { data: guide } = await supabase
    .from('portfolio_guides')
    .select('id, updated_at, type, content_yaml')
    .eq('company_id', entity.id)
    .maybeSingle();

  if (guide) {
    console.log(`\n✅ Guide Found in Database`);
    console.log(`   Updated: ${guide.updated_at}`);
    console.log(`   Type: ${guide.type}`);
    console.log(`\n--- YAML Content ---`);
    console.log(guide.content_yaml);
  } else {
    console.log('❌ No guide in DB');
  }
}

main();
