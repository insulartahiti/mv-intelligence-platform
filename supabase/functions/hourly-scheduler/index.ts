import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class HourlyScheduler {
  private supabase: any

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
  }

  private async callSyncFunction(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/hourly-affinity-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'hourly' })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Sync function failed: ${response.status} - ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      console.error(`Error calling sync function:`, error)
      return {
        success: false,
        message: error.message,
        stats: {}
      }
    }
  }

  private async callEmbeddingFunction(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generate' })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Embedding function failed: ${response.status} - ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      console.error(`Error calling embedding function:`, error)
      return {
        success: false,
        message: error.message,
        stats: {}
      }
    }
  }

  private async logSchedulerRun(result: any): Promise<void> {
    try {
      await this.supabase
        .schema('graph')
        .from('scheduler_logs')
        .insert({
          scheduler_type: 'hourly_sync',
          success: result.success,
          message: result.message,
          stats: result.stats,
          created_at: new Date().toISOString()
        })
    } catch (error) {
      console.error('Error logging scheduler run:', error)
    }
  }

  async runScheduledSync(): Promise<{ success: boolean; message: string; results: any[] }> {
    const startTime = Date.now()
    const results: any[] = []

    try {
      console.log('Starting scheduled hourly sync...')
      
      // Step 1: Run hourly Affinity sync
      console.log('Step 1: Running hourly Affinity sync...')
      const syncStartTime = Date.now()
      const syncResult = await this.callSyncFunction()
      const syncDuration = Date.now() - syncStartTime
      
      results.push({
        step: 'affinity_sync',
        success: syncResult.success,
        message: syncResult.message,
        stats: syncResult.stats,
        duration_ms: syncDuration
      })

      // Step 2: Generate embeddings for new entities (if sync was successful)
      if (syncResult.success && syncResult.stats?.entities_processed > 0) {
        console.log('Step 2: Generating embeddings for new entities...')
        const embeddingStartTime = Date.now()
        const embeddingResult = await this.callEmbeddingFunction()
        const embeddingDuration = Date.now() - embeddingStartTime
        
        results.push({
          step: 'embeddings',
          success: embeddingResult.success,
          message: embeddingResult.message,
          stats: embeddingResult.stats,
          duration_ms: embeddingDuration
        })
      } else {
        console.log('Step 2: Skipping embeddings - no new entities to process')
        results.push({
          step: 'embeddings',
          success: true,
          message: 'Skipped - no new entities',
          stats: {},
          duration_ms: 0
        })
      }

      const totalDuration = Date.now() - startTime
      const overallSuccess = results.every(r => r.success)

      // Log the scheduler run
      await this.logSchedulerRun({
        success: overallSuccess,
        message: `Scheduled sync completed in ${totalDuration}ms`,
        stats: {
          total_duration_ms: totalDuration,
          steps_completed: results.length,
          entities_processed: syncResult.stats?.entities_processed || 0
        }
      })

      console.log(`Scheduled sync completed in ${totalDuration}ms`)

      return {
        success: overallSuccess,
        message: `Scheduled sync completed in ${totalDuration}ms`,
        results
      }
    } catch (error) {
      console.error('Scheduled sync error:', error)
      
      // Log the error
      await this.logSchedulerRun({
        success: false,
        message: error.message,
        stats: {}
      })

      return {
        success: false,
        message: `Scheduled sync failed: ${error.message}`,
        results
      }
    }
  }

  async getSchedulerStatus(): Promise<any> {
    try {
      // Get last scheduler run
      const { data: lastRun } = await this.supabase
        .schema('graph')
        .from('scheduler_logs')
        .select('*')
        .eq('scheduler_type', 'hourly_sync')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Get sync state
      const { data: syncState } = await this.supabase
        .schema('graph')
        .from('sync_state')
        .select('*')
        .single()

      return {
        last_run: lastRun,
        sync_state: syncState,
        next_run_in: syncState ? 
          Math.max(0, 60 * 60 * 1000 - (Date.now() - new Date(syncState.last_sync_timestamp).getTime())) : 
          'Unknown'
      }
    } catch (error) {
      console.error('Error getting scheduler status:', error)
      return {
        error: error.message
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action = 'run' } = await req.json()
    
    const scheduler = new HourlyScheduler()
    
    let result
    if (action === 'status') {
      result = await scheduler.getSchedulerStatus()
    } else {
      result = await scheduler.runScheduledSync()
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Scheduler error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
