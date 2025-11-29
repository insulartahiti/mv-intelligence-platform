require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testReEnhancementQuery() {
  console.log('🧪 Testing re-enhancement query logic...\n');
  
  try {
    // Test the new query logic
    const { data: entities, error } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, ai_summary, taxonomy, enrichment_data')
      .or('ai_summary.is.null,taxonomy.is.null,enrichment_data->>enhancement_method.not.eq.gpt4o_perplexity_search_hybrid')
      .not('name', 'ilike', '%(%)') // Skip malformed names
      .limit(10);

    if (error) {
      console.error('❌ Query error:', error);
      return;
    }

    console.log(`✅ Found ${entities.length} entities to process`);
    
    // Analyze the results
    let newEntities = 0;
    let reEnhancementEntities = 0;
    let hybridEntities = 0;
    
    entities.forEach(entity => {
      const hasEnhancement = entity.ai_summary && entity.taxonomy;
      const isHybrid = entity.enrichment_data?.enhancement_method === 'gpt4o_perplexity_search_hybrid';
      
      if (!hasEnhancement) {
        newEntities++;
        console.log(`🆕 NEW: ${entity.name} (no enhancement)`);
      } else if (isHybrid) {
        hybridEntities++;
        console.log(`🤖 HYBRID: ${entity.name} (already hybrid - should be skipped)`);
      } else {
        reEnhancementEntities++;
        console.log(`🔄 RE-ENHANCE: ${entity.name} (${entity.enrichment_data?.enhancement_method || 'unknown method'})`);
      }
    });
    
    console.log(`\n📊 Analysis:`);
    console.log(`- New entities: ${newEntities}`);
    console.log(`- Re-enhancement entities: ${reEnhancementEntities}`);
    console.log(`- Already hybrid entities: ${hybridEntities}`);
    console.log(`- Total: ${entities.length}`);
    
    if (hybridEntities > 0) {
      console.log(`\n⚠️  WARNING: Found ${hybridEntities} entities that should be skipped!`);
      console.log('The query logic needs to be fixed.');
    } else {
      console.log(`\n✅ Query logic is working correctly!`);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testReEnhancementQuery();
