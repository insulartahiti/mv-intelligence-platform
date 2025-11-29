import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncJob {
  id: string
  type: 'affinity_sync' | 'file_summaries' | 'embeddings' | 'enrichment' | 'linkedin_import'
  status: 'pending' | 'running' | 'completed' | 'failed'
  priority: number
  created_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
  progress: number
  metadata?: any
}

interface SyncOrchestrator {
  supabase: any
  isRunning: boolean
  currentJob: SyncJob | null
}

class SyncOrchestratorService {
  private supabase: any
  private isRunning: boolean = false
  private currentJob: SyncJob | null = null

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
  }

  async getSyncState(): Promise<any> {
    const { data, error } = await this.supabase
      .schema('graph')
      .from('sync_state')
      .select('*')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching sync state:', error)
      return null
    }

    return data || {
      last_sync_timestamp: new Date(0).toISOString(),
      entities_synced: 0,
      rate_limit_remaining: 300,
      next_sync_allowed: new Date().toISOString(),
      current_batch: 0,
      total_batches: 0
    }
  }

  async updateSyncState(state: any): Promise<void> {
    const { error } = await this.supabase
      .schema('graph')
      .from('sync_state')
      .upsert(state, { onConflict: 'id' })

    if (error) {
      console.error('Error updating sync state:', error)
    }
  }

  async shouldRunSync(): Promise<boolean> {
    const syncState = await this.getSyncState()
    if (!syncState) return false

    const now = new Date()
    const nextSyncAllowed = new Date(syncState.next_sync_allowed)
    
    // Don't run if we're rate limited
    if (now < nextSyncAllowed) {
      console.log(`Rate limited until ${nextSyncAllowed.toISOString()}`)
      return false
    }

    // Don't run if we synced recently (within 30 minutes)
    const lastSync = new Date(syncState.last_sync_timestamp)
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
    if (lastSync > thirtyMinutesAgo) {
      console.log(`Last sync was recent: ${lastSync.toISOString()}`)
      return false
    }

    return true
  }

  async runAffinitySync(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting Affinity sync...')
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/affinity-full-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Affinity sync failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      return result

    } catch (error) {
      console.error('Affinity sync error:', error)
      return {
        success: false,
        message: `Affinity sync failed: ${error.message}`,
        stats: {}
      }
    }
  }

  async runFileSummaries(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting file summary generation...')
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-file-summaries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 10 })
      })

      if (!response.ok) {
        throw new Error(`File summaries failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      return result

    } catch (error) {
      console.error('File summaries error:', error)
      return {
        success: false,
        message: `File summaries failed: ${error.message}`,
        stats: {}
      }
    }
  }

  async runEmbeddings(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting embedding generation...')
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 20 })
      })

      if (!response.ok) {
        throw new Error(`Embeddings failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      return result

    } catch (error) {
      console.error('Embeddings error:', error)
      return {
        success: false,
        message: `Embeddings failed: ${error.message}`,
        stats: {}
      }
    }
  }

  async runEnrichment(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting person enrichment...')
      
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-person-entity`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 5 })
      })

      if (!response.ok) {
        throw new Error(`Enrichment failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      return result

    } catch (error) {
      console.error('Enrichment error:', error)
      return {
        success: false,
        message: `Enrichment failed: ${error.message}`,
        stats: {}
      }
    }
  }

  async runScheduledSync(): Promise<{ success: boolean; message: string; results: any[] }> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Sync orchestrator is already running',
        results: []
      }
    }

    this.isRunning = true
    const results: any[] = []

    try {
      console.log('Starting scheduled sync orchestration...')
      
      const shouldRun = await this.shouldRunSync()
      if (!shouldRun) {
        return {
          success: true,
          message: 'Sync not needed at this time',
          results: []
        }
      }

      // 1. Run Affinity sync
      console.log('Step 1: Running Affinity sync...')
      const affinityResult = await this.runAffinitySync()
      results.push({ step: 'affinity_sync', ...affinityResult })

      if (affinityResult.success) {
        // 2. Generate file summaries
        console.log('Step 2: Generating file summaries...')
        const fileResult = await this.runFileSummaries()
        results.push({ step: 'file_summaries', ...fileResult })

        // 3. Generate embeddings
        console.log('Step 3: Generating embeddings...')
        const embeddingResult = await this.runEmbeddings()
        results.push({ step: 'embeddings', ...embeddingResult })

        // 4. Run enrichment
        console.log('Step 4: Running person enrichment...')
        const enrichmentResult = await this.runEnrichment()
        results.push({ step: 'enrichment', ...enrichmentResult })
      }

      // Update sync state
      await this.updateSyncState({
        last_sync_timestamp: new Date().toISOString(),
        entities_synced: results.reduce((sum, r) => sum + (r.stats?.entities_processed || 0), 0),
        rate_limit_remaining: 300, // Reset after successful sync
        next_sync_allowed: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour cooldown
        current_batch: 0,
        total_batches: 0
      })

      console.log('Scheduled sync orchestration completed')

      return {
        success: true,
        message: 'Scheduled sync orchestration completed successfully',
        results
      }

    } catch (error) {
      console.error('Sync orchestration error:', error)
      return {
        success: false,
        message: `Sync orchestration failed: ${error.message}`,
        results
      }
    } finally {
      this.isRunning = false
    }
  }

  async getSyncStatus(): Promise<any> {
    const syncState = await this.getSyncState()
    
    return {
      is_running: this.isRunning,
      current_job: this.currentJob,
      sync_state: syncState,
      last_run: syncState?.last_sync_timestamp || null,
      next_run_allowed: syncState?.next_sync_allowed || null,
      rate_limit_remaining: syncState?.rate_limit_remaining || 300
    }
  }

  async triggerManualSync(jobType: string): Promise<{ success: boolean; message: string; result: any }> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Sync orchestrator is already running',
        result: null
      }
    }

    this.isRunning = true

    try {
      let result: any

      switch (jobType) {
        case 'affinity_sync':
          result = await this.runAffinitySync()
          break
        case 'file_summaries':
          result = await this.runFileSummaries()
          break
        case 'embeddings':
          result = await this.runEmbeddings()
          break
        case 'enrichment':
          result = await this.runEnrichment()
          break
        default:
          throw new Error(`Unknown job type: ${jobType}`)
      }

      return {
        success: result.success,
        message: result.message,
        result
      }

    } catch (error) {
      console.error(`Manual sync error for ${jobType}:`, error)
      return {
        success: false,
        message: `Manual sync failed: ${error.message}`,
        result: null
      }
    } finally {
      this.isRunning = false
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const orchestrator = new SyncOrchestratorService()
    
    if (req.method === 'GET') {
      // Return sync status
      const status = await orchestrator.getSyncStatus()
      return new Response(
        JSON.stringify({
          success: true,
          status
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { action, jobType } = body

      if (action === 'run_scheduled') {
        // Run scheduled sync
        const result = await orchestrator.runScheduledSync()
        return new Response(
          JSON.stringify(result),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: result.success ? 200 : 500,
          }
        )
      } else if (action === 'run_manual' && jobType) {
        // Run manual sync for specific job type
        const result = await orchestrator.triggerManualSync(jobType)
        return new Response(
          JSON.stringify(result),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: result.success ? 200 : 500,
          }
        )
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Invalid action or missing jobType'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        )
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Method not allowed'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      }
    )

  } catch (error) {
    console.error('Sync orchestrator error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        message: `Service error: ${error.message}`,
        results: []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
