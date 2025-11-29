#!/usr/bin/env node

/**
 * Continuous Embedding Generation
 * Processes ALL entities without embeddings continuously until complete
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateEmbedding(entity) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: `${entity.name} ${entity.type} ${entity.domain || ''} ${entity.industry || ''}`.trim(),
        model: 'text-embedding-3-small'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error(`Error generating embedding for ${entity.name}:`, error.message);
    return null;
  }
}

async function processBatch(entities) {
  const promises = entities.map(async (entity) => {
    const embedding = await generateEmbedding(entity);
    if (embedding) {
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .update({ 
          embedding: embedding,
          updated_at: new Date().toISOString()
        })
        .eq('id', entity.id);
      
      if (error) {
        console.error(`Error updating ${entity.name}:`, error);
        return false;
      }
      return true;
    }
    return false;
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean).length;
}

async function runContinuousEmbeddingGeneration() {
  console.log('🚀 Starting Continuous Embedding Generation...\n');
  
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalErrors = 0;
  let batchCount = 0;
  
  while (true) {
    try {
      // Get entities without embeddings (batch of 1000)
      const { data: entitiesWithoutEmbeddings, count: totalWithout } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, domain, industry, embedding')
        .is('embedding', null)
        .limit(1000);
      
      if (!entitiesWithoutEmbeddings || entitiesWithoutEmbeddings.length === 0) {
        console.log('\n🎉 All entities have embeddings! Process complete.');
        break;
      }
      
      batchCount++;
      console.log(`\n📊 Batch ${batchCount}: Found ${entitiesWithoutEmbeddings.length} entities without embeddings`);
      console.log(`🎯 Processing in batches of 50 entities...\n`);
      
      const batchSize = 50;
      let batchProcessed = 0;
      let batchSuccess = 0;
      let batchErrors = 0;
      
      for (let i = 0; i < entitiesWithoutEmbeddings.length; i += batchSize) {
        const batch = entitiesWithoutEmbeddings.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(entitiesWithoutEmbeddings.length / batchSize);
        
        console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);
        
        const successCount = await processBatch(batch);
        batchSuccess += successCount;
        batchErrors += (batch.length - successCount);
        batchProcessed += batch.length;
        
        const progress = ((i + batch.length) / entitiesWithoutEmbeddings.length * 100).toFixed(1);
        console.log(`   ✅ Success: ${successCount}/${batch.length} | Batch: ${batchSuccess}/${batchProcessed} (${progress}%)`);
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < entitiesWithoutEmbeddings.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Update totals
      totalProcessed += batchProcessed;
      totalSuccess += batchSuccess;
      totalErrors += batchErrors;
      
      console.log(`\n📊 Batch ${batchCount} Complete:`);
      console.log(`   • Processed: ${batchProcessed}`);
      console.log(`   • Success: ${batchSuccess}`);
      console.log(`   • Errors: ${batchErrors}`);
      console.log(`   • Success rate: ${((batchSuccess / batchProcessed) * 100).toFixed(1)}%`);
      
      // Check overall progress
      const { count: currentWithEmbeddings } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);
      
      const { count: currentTotal } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true });
      
      const currentCoverage = currentTotal ? (currentWithEmbeddings / currentTotal * 100).toFixed(1) : 0;
      console.log(`\n📈 Overall Progress: ${currentWithEmbeddings}/${currentTotal} (${currentCoverage}%)`);
      console.log(`   • Total processed: ${totalProcessed}`);
      console.log(`   • Total success: ${totalSuccess}`);
      console.log(`   • Total errors: ${totalErrors}`);
      
      // Small delay before next batch
      console.log('\n⏳ Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('❌ Error in continuous embedding generation:', error);
      console.log('⏳ Waiting 5 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`\n🎉 Continuous Embedding Generation Complete!`);
  console.log(`   • Total batches: ${batchCount}`);
  console.log(`   • Total processed: ${totalProcessed}`);
  console.log(`   • Total success: ${totalSuccess}`);
  console.log(`   • Total errors: ${totalErrors}`);
  console.log(`   • Overall success rate: ${((totalSuccess / totalProcessed) * 100).toFixed(1)}%`);
}

// Run the continuous generation
runContinuousEmbeddingGeneration().catch(console.error);
