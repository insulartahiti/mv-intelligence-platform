#!/usr/bin/env node

/**
 * Optimized Entity Enhancement System
 * Fast, efficient entity enrichment with Perplexity API
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

async function runOptimizedEnhancement() {
  console.log('🚀 Starting Optimized Enhancement System...\n');
  
  try {
    // Get high-value entities for enhancement (prioritize those without enrichment)
    const { data: entities, error: fetchError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, enrichment_data, is_portfolio, is_pipeline, is_internal')
      .in('type', ['company', 'person', 'organization'])
      .order('is_portfolio', { ascending: false })
      .order('is_pipeline', { ascending: false })
      .order('is_internal', { ascending: false })
      .order('enrichment_data', { ascending: true, nullsFirst: true }) // Prioritize entities without enrichment data
      .limit(200); // Process 200 entities at a time
    
    if (fetchError) {
      console.error('Error fetching entities:', fetchError);
      return;
    }
    
    if (!entities || entities.length === 0) {
      console.log('✅ No entities need enhancement');
      return;
    }
    
    console.log(`📊 Processing ${entities.length} entities for enhancement...`);
    
    let enhanced = 0;
    let errors = 0;
    
    // Process entities in parallel batches
    const batchSize = 10;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(entities.length / batchSize);
      
      console.log(`\n🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);
      
      const batchPromises = batch.map(async (entity) => {
        const success = await enhanceEntity(entity);
        if (success) {
          enhanced++;
          console.log(`   ✅ Enhanced: ${entity.name}`);
        } else {
          errors++;
          console.log(`   ⚠️  Skipped: ${entity.name}`);
        }
      });
      
      await Promise.all(batchPromises);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < entities.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\n🎉 Enhancement Complete!`);
    console.log(`   • Enhanced: ${enhanced}`);
    console.log(`   • Errors: ${errors}`);
    console.log(`   • Total processed: ${entities.length}`);
    
  } catch (error) {
    console.error('❌ Error in enhancement system:', error);
  }
}

// Run the enhancement
runOptimizedEnhancement().catch(console.error);
