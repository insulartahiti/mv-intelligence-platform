#!/usr/bin/env node

/**
 * Conservative Perplexity Enhancement
 * Optimized for Perplexity API rate limits with smaller batches and longer delays
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Conservative settings for Perplexity API
const BATCH_SIZE = 5; // Much smaller batches
const FETCH_LIMIT = 100; // Fetch fewer entities at a time
const DELAY_BETWEEN_ENTITIES_MS = 2000; // 2 seconds between each entity
const DELAY_BETWEEN_BATCHES_MS = 15000; // 15 seconds between batches
const DELAY_BETWEEN_ROUNDS_MS = 60000; // 1 minute between rounds

async function searchWeb(query, maxResults = 3) {
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey) {
    return '';
  }

  try {
    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        max_results: maxResults
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('⚠️ Perplexity rate limit hit, waiting 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        return '';
      }
      return '';
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      return JSON.stringify({
        query: query,
        results: data.results.map(result => ({
          title: result.title,
          url: result.url,
          snippet: result.snippet
        })),
        summary: `Found ${data.results.length} relevant results for: ${query}`
      }, null, 2);
    }
    
    return '';
  } catch (error) {
    console.log('⚠️ Perplexity search error:', error.message);
    return '';
  }
}

function getEnrichmentQuery(entity) {
  const queries = [];
  
  if (entity.type === 'company') {
    queries.push(`${entity.name} company latest news 2024`);
    queries.push(`${entity.name} funding investment news`);
    queries.push(`${entity.name} leadership team executives`);
  } else if (entity.type === 'person') {
    queries.push(`${entity.name} professional background current role`);
    queries.push(`${entity.name} recent news achievements 2024`);
  } else if (entity.type === 'organization') {
    queries.push(`${entity.name} organization latest updates 2024`);
  }
  
  return queries[0] || `${entity.name} latest information 2024`;
}

async function enhanceEntity(entity) {
  try {
    const query = getEnrichmentQuery(entity);
    const webData = await searchWeb(query);
    
    if (webData) {
      // Update entity with enrichment data
      const currentEnrichment = entity.enrichment_data || {};
      const updatedEnrichment = {
        ...currentEnrichment,
        web_search_data: webData,
        last_enhanced: new Date().toISOString(),
        enhancement_version: '2.0'
      };
      
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .update({ 
          enrichment_data: updatedEnrichment,
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
  } catch (error) {
    console.error(`Error enhancing ${entity.name}:`, error);
    return false;
  }
}

async function runConservativePerplexityEnhancement() {
  console.log('🚀 Starting Conservative Perplexity Enhancement...\n');
  console.log(`📊 Settings: ${BATCH_SIZE} entities per batch, ${DELAY_BETWEEN_ENTITIES_MS/1000}s between entities\n`);
  
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;
  let roundCount = 0;
  
  while (true) {
    try {
      roundCount++;
      console.log(`\n📊 Round ${roundCount}: Fetching entities for enhancement...`);
      
      // Get entities that need enhancement (prioritize those without enrichment, then those with partial enrichment)
      const { data: entities, error: fetchError } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, enrichment_data, is_portfolio, is_pipeline, is_internal')
        .in('type', ['company', 'person', 'organization'])
        .or('enrichment_data.is.null,enrichment_data->last_enhanced.is.null')
        .order('is_portfolio', { ascending: false })
        .order('is_pipeline', { ascending: false })
        .order('is_internal', { ascending: false })
        .order('enrichment_data', { ascending: true, nullsFirst: true })
        .limit(FETCH_LIMIT);
      
      if (fetchError) {
        console.error('Error fetching entities:', fetchError);
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }
      
      if (!entities || entities.length === 0) {
        console.log('\n🎉 All entities have been enhanced! Process complete.');
        break;
      }
      
      console.log(`📊 Round ${roundCount}: Found ${entities.length} entities for enhancement`);
      console.log(`🎯 Processing in batches of ${BATCH_SIZE} entities...\n`);
      
      let roundProcessed = 0;
      let roundSuccess = 0;
      let roundSkipped = 0;
      
      // Process entities in small batches
      for (let i = 0; i < entities.length; i += BATCH_SIZE) {
        const batch = entities.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(entities.length / BATCH_SIZE);
        
        console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);
        
        // Process each entity individually with delays
        for (let j = 0; j < batch.length; j++) {
          const entity = batch[j];
          const entityNumber = i + j + 1;
          
          console.log(`   🔍 [${entityNumber}/${entities.length}] Enhancing: ${entity.name}`);
          
          const success = await enhanceEntity(entity);
          if (success) {
            roundSuccess++;
            console.log(`   ✅ Enhanced: ${entity.name}`);
          } else {
            roundSkipped++;
            console.log(`   ⚠️ Skipped: ${entity.name}`);
          }
          
          roundProcessed++;
          
          // Delay between entities (except for the last one in the batch)
          if (j < batch.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ENTITIES_MS));
          }
        }
        
        const progress = ((i + batch.length) / entities.length * 100).toFixed(1);
        console.log(`   📊 Batch ${batchNumber} Complete: ${roundSuccess}/${roundProcessed} enhanced (${progress}%)`);
        
        // Delay between batches (except for the last batch)
        if (i + BATCH_SIZE < entities.length) {
          console.log(`   ⏳ Waiting ${DELAY_BETWEEN_BATCHES_MS/1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
        }
      }
      
      // Update totals
      totalProcessed += roundProcessed;
      totalSuccess += roundSuccess;
      totalSkipped += roundSkipped;
      
      console.log(`\n📊 Round ${roundCount} Complete:`);
      console.log(`   • Processed: ${roundProcessed}`);
      console.log(`   • Enhanced: ${roundSuccess}`);
      console.log(`   • Skipped: ${roundSkipped}`);
      console.log(`   • Success rate: ${((roundSuccess / roundProcessed) * 100).toFixed(1)}%`);
      
      // Check overall progress
      const { count: currentWithEnhancement } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .not('enrichment_data->last_enhanced', 'is', null);
      
      const { count: currentTotal } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true });
      
      const currentCoverage = currentTotal ? (currentWithEnhancement / currentTotal * 100).toFixed(1) : 0;
      console.log(`\n📈 Overall Progress: ${currentWithEnhancement}/${currentTotal} (${currentCoverage}%)`);
      console.log(`   • Total processed: ${totalProcessed}`);
      console.log(`   • Total enhanced: ${totalSuccess}`);
      console.log(`   • Total skipped: ${totalSkipped}`);
      
      // Delay before next round
      console.log(`\n⏳ Waiting ${DELAY_BETWEEN_ROUNDS_MS/1000} seconds before next round...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ROUNDS_MS));
      
    } catch (error) {
      console.error('❌ Error in conservative Perplexity enhancement:', error);
      console.log('⏳ Waiting 60 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }
  
  console.log(`\n🎉 Conservative Perplexity Enhancement Complete!`);
  console.log(`   • Total rounds: ${roundCount}`);
  console.log(`   • Total processed: ${totalProcessed}`);
  console.log(`   • Total enhanced: ${totalSuccess}`);
  console.log(`   • Total skipped: ${totalSkipped}`);
  console.log(`   • Overall success rate: ${((totalSuccess / totalProcessed) * 100).toFixed(1)}%`);
}

// Run the conservative enhancement
runConservativePerplexityEnhancement().catch(console.error);
