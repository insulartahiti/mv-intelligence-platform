require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkEnhancementStatus() {
  console.log('📊 Checking current enhancement status...\n');
  
  try {
    // Get total entities
    const { count: totalEntities } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true });

    // Get entities with AI summary
    const { count: withAISummary } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('ai_summary', 'is', null);

    // Get entities with taxonomy
    const { count: withTaxonomy } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('taxonomy', 'is', null);

    // Get entities with both
    const { count: withBoth } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .not('ai_summary', 'is', null)
      .not('taxonomy', 'is', null);

    // Get entities with hybrid enhancement method
    const { count: withHybridMethod } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .eq('enrichment_data->>enhancement_method', 'gpt4o_perplexity_search_hybrid');

    // Get sample of enhancement methods
    const { data: sampleMethods } = await supabase
      .schema('graph')
      .from('entities')
      .select('enrichment_data')
      .not('enrichment_data', 'is', null)
      .not('ai_summary', 'is', null)
      .not('taxonomy', 'is', null)
      .limit(20);

    console.log(`📈 Enhancement Status:`);
    console.log(`- Total entities: ${totalEntities}`);
    console.log(`- With AI summary: ${withAISummary} (${((withAISummary/totalEntities)*100).toFixed(1)}%)`);
    console.log(`- With taxonomy: ${withTaxonomy} (${((withTaxonomy/totalEntities)*100).toFixed(1)}%)`);
    console.log(`- With both: ${withBoth} (${((withBoth/totalEntities)*100).toFixed(1)}%)`);
    console.log(`- With hybrid method: ${withHybridMethod} (${((withHybridMethod/totalEntities)*100).toFixed(1)}%)`);
    
    console.log(`\n🔍 Sample enhancement methods:`);
    const methods = {};
    sampleMethods.forEach(entity => {
      const method = entity.enrichment_data?.enhancement_method || 'unknown';
      methods[method] = (methods[method] || 0) + 1;
    });
    
    Object.entries(methods).forEach(([method, count]) => {
      console.log(`  - ${method}: ${count} entities`);
    });

    // Check what our query would return
    const { count: queryCount } = await supabase
      .schema('graph')
      .from('entities')
      .select('*', { count: 'exact', head: true })
      .or('ai_summary.is.null,taxonomy.is.null,enrichment_data->>enhancement_method.not.eq.gpt4o_perplexity_search_hybrid')
      .not('name', 'ilike', '%(%)');

    console.log(`\n🎯 Entities our query would process: ${queryCount} (${((queryCount/totalEntities)*100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkEnhancementStatus();
