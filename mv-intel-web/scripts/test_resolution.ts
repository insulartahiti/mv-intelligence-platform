
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uqptiychukuwixubrbat.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const slug = 'Aufinity';
  console.log(`Resolving slug: ${slug}`);

  // Current logic simulation
  const { data: entity1 } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, is_portfolio')
    .ilike('name', `%${slug}%`)
    .limit(1)
    .maybeSingle();

  console.log('Current Logic Result:', entity1);

  // Proposed logic
  const { data: entities2 } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, is_portfolio')
    .ilike('name', `%${slug}%`)
    .order('is_portfolio', { ascending: false })
    .limit(1);

  console.log('Proposed Logic Result:', entities2 ? entities2[0] : null);
}

main();
