
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uqptiychukuwixubrbat.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('--- Checking Aufinity Entity ---');
  
  // 1. Check Entity
  const { data: entities, error: entityError } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, is_portfolio')
    .ilike('name', '%aufinity%');

  if (entityError) {
    console.error('Error fetching entities:', entityError);
    return;
  }

  console.table(entities);

  if (entities && entities.length > 0) {
    for (const entity of entities) {
        console.log(`\n--- Checking Guides for ${entity.name} (${entity.id}) ---`);
        const { data: guides, error: guideError } = await supabase
          .from('portfolio_guides')
          .select('*')
          .eq('company_id', entity.id);

        if (guideError) {
            console.error('Error fetching guides:', guideError);
        } else if (guides && guides.length > 0) {
            console.table(guides.map(g => ({
                id: g.id,
                type: g.type,
                updated_at: g.updated_at,
                yaml_preview: g.content_yaml ? g.content_yaml.substring(0, 50) + '...' : 'NULL'
            })));
        } else {
            console.log('No guides found for this entity.');
        }
    }
  } else {
    console.log('No Aufinity entity found.');
  }
}

main();
