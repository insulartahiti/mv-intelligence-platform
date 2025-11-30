require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debugHybridEnhancement() {
  console.log('🔍 Debugging hybrid enhancement status...\n');
  
  try {
    // Check entities with hybrid enhancement method
    const { data: hybridEntities, error: hybridError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, enrichment_data, updated_at')
      .eq('enrichment_data->>enhancement_method', 'gpt4o_perplexity_search_hybrid')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (hybridError) {
      console.error('❌ Error fetching hybrid entities:', hybridError);
      return;
    }

    console.log(`✅ Found ${hybridEntities.length} entities with hybrid enhancement method:`);
    hybridEntities.forEach(entity => {
      console.log(`  - ${entity.name} (${entity.type}) - Updated: ${entity.updated_at}`);
    });

    // Check recent entities with AI summary and taxonomy
    const { data: recentEnhanced, error: recentError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, enrichment_data, updated_at')
      .not('ai_summary', 'is', null)
      .not('taxonomy', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('❌ Error fetching recent enhanced entities:', recentError);
      return;
    }

    console.log(`\n📊 Recent enhanced entities (${recentEnhanced.length}):`);
    recentEnhanced.forEach(entity => {
      const method = entity.enrichment_data?.enhancement_method || 'unknown';
      console.log(`  - ${entity.name} (${entity.type}) - Method: ${method} - Updated: ${entity.updated_at}`);
    });

    // Check if there are entities that should have hybrid method but don't
    const { data: missingHybrid, error: missingError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, enrichment_data, updated_at')
      .not('ai_summary', 'is', null)
      .not('taxonomy', 'is', null)
      .not('enrichment_data->>enhancement_method', 'eq', 'gpt4o_perplexity_search_hybrid')
      .order('updated_at', { ascending: false })
      .limit(5);

    if (missingError) {
      console.error('❌ Error fetching missing hybrid entities:', missingError);
      return;
    }

    console.log(`\n⚠️  Entities with AI summary + taxonomy but NOT hybrid method (${missingHybrid.length}):`);
    missingHybrid.forEach(entity => {
      const method = entity.enrichment_data?.enhancement_method || 'none';
      console.log(`  - ${entity.name} (${entity.type}) - Method: ${method} - Updated: ${entity.updated_at}`);
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

debugHybridEnhancement();
