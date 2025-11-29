#!/usr/bin/env tsx

/**
 * Batch LinkedIn Entity Enrichment
 * Enriches all LinkedIn first-degree connections with web research
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface EnrichmentStats {
  total: number
  enriched: number
  alreadyEnriched: number
  errors: number
  skipped: number
}

async function enrichLinkedInEntities() {
  console.log('🔍 Starting LinkedIn entity enrichment...\n')

  try {
    // Get all LinkedIn first-degree connections that haven't been enriched
    const { data: entities, error: fetchError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, linkedin_first_degree, enriched, last_enriched_at')
      .eq('type', 'person')
      .eq('linkedin_first_degree', true)

    if (fetchError) {
      throw new Error(`Failed to fetch entities: ${fetchError.message}`)
    }

    if (!entities || entities.length === 0) {
      console.log('ℹ️  No LinkedIn first-degree connections found to enrich')
      return
    }

    console.log(`📊 Found ${entities.length} LinkedIn first-degree connections`)

    const stats: EnrichmentStats = {
      total: entities.length,
      enriched: 0,
      alreadyEnriched: 0,
      errors: 0,
      skipped: 0
    }

    // Process entities in batches to avoid rate limits
    const batchSize = 5
    const delayBetweenBatches = 2000 // 2 seconds

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize)
      console.log(`\n🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entities.length / batchSize)}`)

      // Process batch concurrently
      const batchPromises = batch.map(async (entity) => {
        try {
          // Force refresh all entities since previous enrichment had empty data
          if (entity.enriched && entity.last_enriched_at) {
            const lastEnriched = new Date(entity.last_enriched_at)
            const daysSinceEnriched = (Date.now() - lastEnriched.getTime()) / (1000 * 60 * 60 * 24)
            
            console.log(`🔄 Force refreshing ${entity.name} (enriched ${daysSinceEnriched.toFixed(1)} days ago)`)
            // Continue to force refresh instead of skipping
          }

          console.log(`🔍 Enriching: ${entity.name}`)

          // Call the enhanced enrichment function
          const { data, error } = await supabase.functions.invoke('enrich-person-entity-enhanced', {
            body: {
              entity_id: entity.id,
              force_refresh: entity.enriched // Force refresh if already enriched
            }
          })

          if (error) {
            console.error(`❌ Error enriching ${entity.name}:`, error.message)
            stats.errors++
            return
          }

          if (data?.success) {
            console.log(`✅ Enriched: ${entity.name}`)
            stats.enriched++
          } else {
            console.log(`⚠️  No enrichment data for: ${entity.name}`)
            stats.skipped++
          }

        } catch (error) {
          console.error(`❌ Error processing ${entity.name}:`, error)
          stats.errors++
        }
      })

      // Wait for batch to complete
      await Promise.all(batchPromises)

      // Add delay between batches to respect rate limits
      if (i + batchSize < entities.length) {
        console.log(`⏳ Waiting ${delayBetweenBatches / 1000}s before next batch...`)
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches))
      }
    }

    console.log('\n🎉 LinkedIn entity enrichment completed!')
    console.log(`📊 Final Results:`)
    console.log(`   • Total entities: ${stats.total}`)
    console.log(`   • Successfully enriched: ${stats.enriched}`)
    console.log(`   • Already enriched: ${stats.alreadyEnriched}`)
    console.log(`   • Skipped: ${stats.skipped}`)
    console.log(`   • Errors: ${stats.errors}`)

    // Show some examples of enriched data
    console.log('\n📋 Sample enriched entities:')
    const { data: sampleEntities } = await supabase
      .schema('graph')
      .from('entities')
      .select('name, enrichment_data, expertise_areas')
      .eq('type', 'person')
      .eq('enriched', true)
      .not('enrichment_data', 'is', null)
      .limit(3)

    if (sampleEntities) {
      sampleEntities.forEach(entity => {
        console.log(`\n👤 ${entity.name}:`)
        if (entity.expertise_areas && entity.expertise_areas.length > 0) {
          console.log(`   Expertise: ${entity.expertise_areas.join(', ')}`)
        }
        if (entity.enrichment_data?.current_employer) {
          console.log(`   Current employer: ${entity.enrichment_data.current_employer}`)
        }
        if (entity.enrichment_data?.expertise_areas && entity.enrichment_data.expertise_areas.length > 0) {
          console.log(`   Areas: ${entity.enrichment_data.expertise_areas.join(', ')}`)
        }
      })
    }

  } catch (error) {
    console.error('❌ Enrichment process failed:', error)
    process.exit(1)
  }
}

// Run the enrichment
enrichLinkedInEntities()
