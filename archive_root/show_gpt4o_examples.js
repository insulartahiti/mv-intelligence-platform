require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function showGPT4oExamples() {
  console.log('🤖 GPT-4o Enrichment Examples\n');
  
  // Get entities that have been enhanced recently
  const { data: entities } = await supabase
    .schema('graph')
    .from('entities')
    .select('name, type, industry, ai_summary, taxonomy, enrichment_data, updated_at')
    .not('ai_summary', 'is', null)
    .not('taxonomy', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5);
    
  if (!entities || entities.length === 0) {
    console.log('No enhanced entities found. Let me check for any AI summaries...');
    
    const { data: anyEnhanced } = await supabase
      .schema('graph')
      .from('entities')
      .select('name, type, industry, ai_summary, taxonomy, enrichment_data, updated_at')
      .not('ai_summary', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(3);
      
    if (anyEnhanced && anyEnhanced.length > 0) {
      console.log('\n📊 Recent AI Enhanced Entities:');
      anyEnhanced.forEach((entity, i) => {
        console.log(`\n${i+1}. ${entity.name} (${entity.type})`);
        console.log(`   Industry: ${entity.industry || 'Not specified'}`);
        console.log(`   AI Summary: ${entity.ai_summary?.substring(0, 150)}...`);
        console.log(`   Taxonomy: ${JSON.stringify(entity.taxonomy) || 'None'}`);
        console.log(`   Updated: ${entity.updated_at}`);
      });
    } else {
      console.log('No AI enhanced entities found yet.');
    }
    return;
  }
  
  console.log('📊 GPT-4o Enhanced Entities:');
  entities.forEach((entity, i) => {
    console.log(`\n${i+1}. ${entity.name} (${entity.type})`);
    console.log(`   Industry: ${entity.industry || 'Not specified'}`);
    console.log(`   AI Summary: ${entity.ai_summary?.substring(0, 200)}...`);
    console.log(`   Taxonomy: ${JSON.stringify(entity.taxonomy)}`);
    console.log(`   Updated: ${entity.updated_at}`);
    
    // Show enrichment data structure if available
    if (entity.enrichment_data) {
      console.log(`   Enrichment Data Keys: ${Object.keys(entity.enrichment_data).join(', ')}`);
    }
  });
  
  // Show some statistics
  const { data: stats } = await supabase
    .schema('graph')
    .from('entities')
    .select('ai_summary, taxonomy')
    .not('ai_summary', 'is', null);
    
  if (stats) {
    const withTaxonomy = stats.filter(e => e.taxonomy && e.taxonomy.length > 0);
    console.log(`\n📈 Enhancement Statistics:`);
    console.log(`   Total with AI Summary: ${stats.length}`);
    console.log(`   With Taxonomy: ${withTaxonomy.length}`);
    console.log(`   Taxonomy Coverage: ${((withTaxonomy.length / stats.length) * 100).toFixed(1)}%`);
  }
}

showGPT4oExamples().catch(console.error);
