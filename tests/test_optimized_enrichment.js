require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const OptimizedAIEnrichmentSystem = require('./optimized_ai_enrichment_system');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testOptimizedEnrichment() {
  console.log('🧪 Testing Optimized AI Enrichment System...\n');

  // Test with a specific entity
  const { data: testEntities, error } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, type, industry, ai_summary, taxonomy, enrichment_data')
    .eq('name', 'Ben Milne') // Test with a known entity
    .limit(1);

  if (error || !testEntities || testEntities.length === 0) {
    console.error('Error fetching test entity:', error);
    return;
  }

  const testEntity = testEntities[0];

  console.log('📊 Test Entity:');
  console.log(`   Name: ${testEntity.name}`);
  console.log(`   Type: ${testEntity.type}`);
  console.log(`   Industry: ${testEntity.industry || 'Not specified'}`);
  console.log(`   Current AI Summary: ${testEntity.ai_summary || 'None'}`);
  console.log(`   Current Taxonomy: ${JSON.stringify(testEntity.taxonomy) || 'None'}\n`);

  // Initialize the system
  const system = new OptimizedAIEnrichmentSystem();

  try {
    // Test Step 1: Analyze research needs
    console.log('🔍 Step 1: Analyzing research needs...');
    const researchNeeds = await system.analyzeEntityForResearchNeeds(testEntity);
    console.log('Research Analysis Result:');
    console.log(JSON.stringify(researchNeeds, null, 2));
    console.log('');

    // Test Step 2: Web research (if needed)
    if (researchNeeds.research_needed.length > 0) {
      console.log('🌐 Step 2: Performing web research...');
      const webResearch = await system.performWebResearch(testEntity, researchNeeds);
      console.log('Web Research Results:');
      Object.keys(webResearch).forEach(key => {
        console.log(`   ${key}: ${webResearch[key].content ? webResearch[key].content.substring(0, 100) + '...' : 'Error'}`);
      });
      console.log('');

      // Test Step 3: Synthesis
      console.log('🧠 Step 3: Synthesizing enhanced entity...');
      const enhancedData = await system.synthesizeEnhancedEntity(testEntity, webResearch);
      console.log('Enhanced Entity Data:');
      console.log(JSON.stringify(enhancedData, null, 2));
      console.log('');

      // Test Step 4: Update (optional - comment out to avoid updating)
      // console.log('💾 Step 4: Updating entity...');
      // const success = await system.updateEntity(testEntity.id, enhancedData, webResearch);
      // console.log(`Update successful: ${success}`);
    } else {
      console.log('ℹ️  No web research needed for this entity');
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

// Run the test
testOptimizedEnrichment().catch(console.error);
