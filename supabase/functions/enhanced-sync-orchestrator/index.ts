import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncMetrics {
  sync_type: string
  entities_processed: number
  entities_created: number
  entities_updated: number
  entities_unchanged: number
  processing_time_ms: number
  rate_limit_remaining: number
  error_count: number
}

interface SyncOrchestrationResult {
  success: boolean
  message: string
  results: {
    step: string
    success: boolean
    message: string
    stats: any
    duration_ms: number
  }[]
  total_duration_ms: number
  summary: {
    total_entities_processed: number
    total_entities_created: number
    total_entities_updated: number
    total_errors: number
  }
}

class SyncOrchestrator {
  private supabase: any
  private isRunning: boolean = false

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
  }

  private async logSyncMetrics(metrics: SyncMetrics): Promise<void> {
    try {
      await this.supabase
        .schema('graph')
        .from('sync_metrics')
        .insert(metrics)
    } catch (error) {
      console.error('Error logging sync metrics:', error)
    }
  }

  private async callSyncFunction(functionName: string, body: any = {}): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Function ${functionName} failed: ${response.status} - ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      console.error(`Error calling ${functionName}:`, error)
      return {
        success: false,
        message: error.message,
        stats: {}
      }
    }
  }

  private async shouldRunSync(): Promise<boolean> {
    try {
      const { data: syncState } = await this.supabase
        .schema('graph')
        .from('sync_state')
        .select('*')
        .single()

      if (!syncState) {
        return true // No sync state, should run
      }

      const lastSync = new Date(syncState.last_sync_timestamp)
      const now = new Date()
      const timeSinceLastSync = now.getTime() - lastSync.getTime()
      
      // Run sync if it's been more than 1 hour since last sync
      return timeSinceLastSync > 60 * 60 * 1000
    } catch (error) {
      console.error('Error checking sync state:', error)
      return true // Default to running sync
    }
  }

  async runIncrementalSync(): Promise<SyncOrchestrationResult> {
    const startTime = Date.now()
    const results: any[] = []
    let totalEntitiesProcessed = 0
    let totalEntitiesCreated = 0
    let totalEntitiesUpdated = 0
    let totalErrors = 0

    try {
      console.log('Starting incremental sync orchestration...')
      
      // Check if sync should run
      const shouldRun = await this.shouldRunSync()
      if (!shouldRun) {
        return {
          success: true,
          message: 'Sync not needed at this time',
          results: [],
          total_duration_ms: 0,
          summary: {
            total_entities_processed: 0,
            total_entities_created: 0,
            total_entities_updated: 0,
            total_errors: 0
          }
        }
      }

      // Step 1: Run incremental Affinity sync
      console.log('Step 1: Running incremental Affinity sync...')
      const affinityStartTime = Date.now()
      const affinityResult = await this.callSyncFunction('enhanced-affinity-sync', { action: 'incremental' })
      const affinityDuration = Date.now() - affinityStartTime
      
      results.push({
        step: 'affinity_sync',
        success: affinityResult.success,
        message: affinityResult.message,
        stats: affinityResult.stats,
        duration_ms: affinityDuration
      })

      if (affinityResult.success) {
        totalEntitiesProcessed += affinityResult.stats?.total_processed || 0
        totalEntitiesCreated += affinityResult.stats?.organizations_changed || 0
        totalEntitiesUpdated += affinityResult.stats?.persons_changed || 0
      } else {
        totalErrors++
      }

      // Step 2: Generate embeddings for new entities
      console.log('Step 2: Generating embeddings...')
      const embeddingStartTime = Date.now()
      const embeddingResult = await this.callSyncFunction('generate-embeddings', { action: 'generate' })
      const embeddingDuration = Date.now() - embeddingStartTime
      
      results.push({
        step: 'embeddings',
        success: embeddingResult.success,
        message: embeddingResult.message,
        stats: embeddingResult.stats,
        duration_ms: embeddingDuration
      })

      if (!embeddingResult.success) {
        totalErrors++
      }

      // Step 3: Process files for new organizations
      console.log('Step 3: Processing files...')
      const fileStartTime = Date.now()
      const fileResult = await this.callSyncFunction('process-affinity-files', { action: 'process_new' })
      const fileDuration = Date.now() - fileStartTime
      
      results.push({
        step: 'file_processing',
        success: fileResult.success,
        message: fileResult.message,
        stats: fileResult.stats,
        duration_ms: fileDuration
      })

      if (!fileResult.success) {
        totalErrors++
      }

      // Step 4: Run person enrichment for new persons
      console.log('Step 4: Running person enrichment...')
      const enrichmentStartTime = Date.now()
      const enrichmentResult = await this.callSyncFunction('enrich-person-entity', { action: 'enrich_new' })
      const enrichmentDuration = Date.now() - enrichmentStartTime
      
      results.push({
        step: 'person_enrichment',
        success: enrichmentResult.success,
        message: enrichmentResult.message,
        stats: enrichmentResult.stats,
        duration_ms: enrichmentDuration
      })

      if (!enrichmentResult.success) {
        totalErrors++
      }

      // Log sync metrics
      const totalDuration = Date.now() - startTime
      await this.logSyncMetrics({
        sync_type: 'incremental',
        entities_processed: totalEntitiesProcessed,
        entities_created: totalEntitiesCreated,
        entities_updated: totalEntitiesUpdated,
        entities_unchanged: 0,
        processing_time_ms: totalDuration,
        rate_limit_remaining: affinityResult.stats?.rate_limit_remaining || 300,
        error_count: totalErrors
      })

      console.log('Incremental sync orchestration completed')

      return {
        success: true,
        message: 'Incremental sync orchestration completed successfully',
        results,
        total_duration_ms: totalDuration,
        summary: {
          total_entities_processed: totalEntitiesProcessed,
          total_entities_created: totalEntitiesCreated,
          total_entities_updated: totalEntitiesUpdated,
          total_errors: totalErrors
        }
      }
    } catch (error) {
      console.error('Sync orchestration error:', error)
      return {
        success: false,
        message: `Sync orchestration failed: ${error.message}`,
        results,
        total_duration_ms: Date.now() - startTime,
        summary: {
          total_entities_processed: totalEntitiesProcessed,
          total_entities_created: totalEntitiesCreated,
          total_entities_updated: totalEntitiesUpdated,
          total_errors: totalErrors + 1
        }
      }
    }
  }

  async runFullSync(): Promise<SyncOrchestrationResult> {
    const startTime = Date.now()
    const results: any[] = []
    let totalEntitiesProcessed = 0
    let totalEntitiesCreated = 0
    let totalEntitiesUpdated = 0
    let totalErrors = 0

    try {
      console.log('Starting full sync orchestration...')

      // Step 1: Run full Affinity sync
      console.log('Step 1: Running full Affinity sync...')
      const affinityStartTime = Date.now()
      const affinityResult = await this.callSyncFunction('enhanced-affinity-sync', { action: 'full' })
      const affinityDuration = Date.now() - affinityStartTime
      
      results.push({
        step: 'affinity_sync',
        success: affinityResult.success,
        message: affinityResult.message,
        stats: affinityResult.stats,
        duration_ms: affinityDuration
      })

      if (affinityResult.success) {
        totalEntitiesProcessed += affinityResult.stats?.total_processed || 0
        totalEntitiesCreated += affinityResult.stats?.total_processed || 0
      } else {
        totalErrors++
      }

      // Step 2: Generate embeddings for all entities
      console.log('Step 2: Generating embeddings...')
      const embeddingStartTime = Date.now()
      const embeddingResult = await this.callSyncFunction('generate-embeddings', { action: 'generate' })
      const embeddingDuration = Date.now() - embeddingStartTime
      
      results.push({
        step: 'embeddings',
        success: embeddingResult.success,
        message: embeddingResult.message,
        stats: embeddingResult.stats,
        duration_ms: embeddingDuration
      })

      if (!embeddingResult.success) {
        totalErrors++
      }

      // Step 3: Process all files
      console.log('Step 3: Processing files...')
      const fileStartTime = Date.now()
      const fileResult = await this.callSyncFunction('process-affinity-files', { action: 'process_all' })
      const fileDuration = Date.now() - fileStartTime
      
      results.push({
        step: 'file_processing',
        success: fileResult.success,
        message: fileResult.message,
        stats: fileResult.stats,
        duration_ms: fileDuration
      })

      if (!fileResult.success) {
        totalErrors++
      }

      // Log sync metrics
      const totalDuration = Date.now() - startTime
      await this.logSyncMetrics({
        sync_type: 'full',
        entities_processed: totalEntitiesProcessed,
        entities_created: totalEntitiesCreated,
        entities_updated: totalEntitiesUpdated,
        entities_unchanged: 0,
        processing_time_ms: totalDuration,
        rate_limit_remaining: affinityResult.stats?.rate_limit_remaining || 300,
        error_count: totalErrors
      })

      console.log('Full sync orchestration completed')

      return {
        success: true,
        message: 'Full sync orchestration completed successfully',
        results,
        total_duration_ms: totalDuration,
        summary: {
          total_entities_processed: totalEntitiesProcessed,
          total_entities_created: totalEntitiesCreated,
          total_entities_updated: totalEntitiesUpdated,
          total_errors: totalErrors
        }
      }
    } catch (error) {
      console.error('Sync orchestration error:', error)
      return {
        success: false,
        message: `Sync orchestration failed: ${error.message}`,
        results,
        total_duration_ms: Date.now() - startTime,
        summary: {
          total_entities_processed: totalEntitiesProcessed,
          total_entities_created: totalEntitiesCreated,
          total_entities_updated: totalEntitiesUpdated,
          total_errors: totalErrors + 1
        }
      }
    }
  }

  async getSyncStatistics(days: number = 7): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_sync_statistics', { p_days: days })

      if (error) {
        throw error
      }

      return data
    } catch (error) {
      console.error('Error getting sync statistics:', error)
      return []
    }
  }

  async getEntityChangeHistory(entityId: string, limit: number = 50): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_entity_change_history', { 
          p_entity_id: entityId,
          p_limit: limit 
        })

      if (error) {
        throw error
      }

      return data
    } catch (error) {
      console.error('Error getting entity change history:', error)
      return []
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action = 'incremental', days = 7, entity_id, limit = 50 } = await req.json()
    
    const orchestrator = new SyncOrchestrator()
    
    let result
    switch (action) {
      case 'full':
        result = await orchestrator.runFullSync()
        break
      case 'incremental':
        result = await orchestrator.runIncrementalSync()
        break
      case 'statistics':
        result = await orchestrator.getSyncStatistics(days)
        break
      case 'entity_history':
        if (!entity_id) {
          throw new Error('entity_id is required for entity_history action')
        }
        result = await orchestrator.getEntityChangeHistory(entity_id, limit)
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Sync orchestrator error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
