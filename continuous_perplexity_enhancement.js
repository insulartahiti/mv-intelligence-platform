#!/usr/bin/env node

/**
 * Continuous Perplexity Enhancement
 * Processes ALL entities for enhancement continuously until complete
 * Matches the embedding generation approach with large batches and continuous processing
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
        console.log('⚠️ Perplexity rate limit hit, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
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

async function processBatch(entities) {
  const promises = entities.map(async (entity) => {
    const success = await enhanceEntity(entity);
    if (success) {
      return { status: 'success', entityName: entity.name };
    } else {
      return { status: 'skipped', entityName: entity.name };
    }
  });

  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.status === 'success').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;
  
  return { successCount, skippedCount, results };
}

async function runContinuousPerplexityEnhancement() {
  console.log('🚀 Starting Continuous Perplexity Enhancement...\n');
  
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;
  let batchCount = 0;
  
  while (true) {
    try {
      // Get entities that need enhancement (prioritize those without enrichment)
      const { data: entities, error: fetchError } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, enrichment_data, is_portfolio, is_pipeline, is_internal')
        .in('type', ['company', 'person', 'organization'])
        .order('is_portfolio', { ascending: false })
        .order('is_pipeline', { ascending: false })
        .order('is_internal', { ascending: false })
        .order('enrichment_data', { ascending: true, nullsFirst: true })
        .limit(1000); // Process 1000 entities at a time
      
      if (fetchError) {
        console.error('Error fetching entities:', fetchError);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      if (!entities || entities.length === 0) {
        console.log('\n🎉 All entities have been enhanced! Process complete.');
        break;
      }
      
      batchCount++;
      console.log(`\n📊 Batch ${batchCount}: Found ${entities.length} entities for enhancement`);
      console.log(`🎯 Processing in batches of 50 entities...\n`);
      
      const batchSize = 50;
      let batchProcessed = 0;
      let batchSuccess = 0;
      let batchSkipped = 0;
      
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(entities.length / batchSize);
        
        console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);
        
        const { successCount, skippedCount, results } = await processBatch(batch);
        batchSuccess += successCount;
        batchSkipped += skippedCount;
        batchProcessed += batch.length;
        
        const progress = ((i + batch.length) / entities.length * 100).toFixed(1);
        console.log(`   ✅ Enhanced: ${successCount}/${batch.length} | Batch: ${batchSuccess}/${batchProcessed} (${progress}%)`);
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < entities.length) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay for Perplexity
        }
      }
      
      // Update totals
      totalProcessed += batchProcessed;
      totalSuccess += batchSuccess;
      totalSkipped += batchSkipped;
      
      console.log(`\n📊 Batch ${batchCount} Complete:`);
      console.log(`   • Processed: ${batchProcessed}`);
      console.log(`   • Enhanced: ${batchSuccess}`);
      console.log(`   • Skipped: ${batchSkipped}`);
      console.log(`   • Success rate: ${((batchSuccess / batchProcessed) * 100).toFixed(1)}%`);
      
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
      
      // Small delay before next batch
      console.log('\n⏳ Waiting 5 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error('❌ Error in continuous Perplexity enhancement:', error);
      console.log('⏳ Waiting 10 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  console.log(`\n🎉 Continuous Perplexity Enhancement Complete!`);
  console.log(`   • Total batches: ${batchCount}`);
  console.log(`   • Total processed: ${totalProcessed}`);
  console.log(`   • Total enhanced: ${totalSuccess}`);
  console.log(`   • Total skipped: ${totalSkipped}`);
  console.log(`   • Overall success rate: ${((totalSuccess / totalProcessed) * 100).toFixed(1)}%`);
}

// Run the continuous enhancement
runContinuousPerplexityEnhancement().catch(console.error);
