import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncState {
  last_sync_timestamp: string
  entities_synced: number
  rate_limit_remaining: number
  next_sync_allowed: string
  current_batch: number
  total_batches: number
}

class SyncScheduler {
  private supabase: any
  private affinityApiKey: string
  private affinityOrgId: string

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    this.affinityApiKey = Deno.env.get('AFFINITY_API_KEY') ?? ''
    this.affinityOrgId = Deno.env.get('AFFINITY_ORG_ID') ?? '7624528'
  }

  async getSyncState(): Promise<SyncState | null> {
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

  async updateSyncState(state: Partial<SyncState>): Promise<void> {
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
    if (!syncState) {
      return false
    }

    const now = new Date()
    const nextSyncAllowed = new Date(syncState.next_sync_allowed)
    const lastSync = new Date(syncState.last_sync_timestamp)
    
    // Don't run if we're rate limited
    if (now < nextSyncAllowed) {
      console.log(`Rate limited until ${nextSyncAllowed.toISOString()}`)
      return false
    }

    // Don't run if we synced recently (within last hour)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    if (lastSync > oneHourAgo) {
      console.log(`Last sync was recent: ${lastSync.toISOString()}`)
      return false
    }

    return true
  }

  async runIncrementalSync(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting incremental sync...')
      
      const syncState = await this.getSyncState()
      if (!syncState) {
        throw new Error('Failed to get sync state')
      }

      // For now, we'll do a simple incremental sync by checking for updated entities
      // In a full implementation, we'd use Affinity's updated_since parameter
      const lastSync = new Date(syncState.last_sync_timestamp)
      
      // Fetch a small batch of organizations to check for updates
      const response = await fetch(`https://api.affinity.co/organizations?limit=10&organization_id=${this.affinityOrgId}`, {
        headers: {
          'Authorization': `Bearer ${this.affinityApiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Affinity API error: ${response.status}`)
      }

      const data = await response.json()
      const organizations = data.organizations || []

      let updatedCount = 0
      const now = new Date()

      // Check each organization for updates
      for (const org of organizations) {
        // Simple check: if organization was updated since last sync
        const orgUpdated = new Date(org.updated_at || org.created_at)
        if (orgUpdated > lastSync) {
          updatedCount++
          console.log(`Organization ${org.name} was updated: ${orgUpdated.toISOString()}`)
        }
      }

      // Update sync state
      await this.updateSyncState({
        last_sync_timestamp: now.toISOString(),
        entities_synced: syncState.entities_synced + updatedCount,
        rate_limit_remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '300'),
        next_sync_allowed: new Date(now.getTime() + 60 * 1000).toISOString() // 1 minute cooldown
      })

      console.log(`Incremental sync completed. Found ${updatedCount} updated entities.`)

      return {
        success: true,
        message: `Incremental sync completed. Found ${updatedCount} updated entities.`,
        stats: {
          entities_updated: updatedCount,
          last_sync: now.toISOString(),
          rate_limit_remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '300')
        }
      }

    } catch (error) {
      console.error('Incremental sync failed:', error)
      return {
        success: false,
        message: `Incremental sync failed: ${error.message}`,
        stats: {}
      }
    }
  }

  async generateEmbeddings(): Promise<{ success: boolean; message: string; entities_processed: number }> {
    try {
      console.log('Generating embeddings for entities without embeddings...')
      
      // Call the generate-embeddings function
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchSize: 10,
          parallel: true
        })
      })

      if (!response.ok) {
        throw new Error(`Embeddings generation failed: ${response.status}`)
      }

      const result = await response.json()
      console.log('Embeddings generation result:', result)

      return {
        success: result.success,
        message: result.message || 'Embeddings generation completed',
        entities_processed: result.results?.length || 0
      }

    } catch (error) {
      console.error('Embeddings generation failed:', error)
      return {
        success: false,
        message: `Embeddings generation failed: ${error.message}`,
        entities_processed: 0
      }
    }
  }

  async runScheduledSync(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Running scheduled sync check...')
      
      const shouldRun = await this.shouldRunSync()
      if (!shouldRun) {
        return {
          success: true,
          message: 'Sync not needed at this time',
          stats: { skipped: true }
        }
      }

      // Run incremental sync
      const syncResult = await this.runIncrementalSync()
      
      // Generate embeddings for new entities
      console.log('Generating embeddings for new entities...')
      const embeddingResult = await this.generateEmbeddings()

      return {
        success: syncResult.success && embeddingResult.success,
        message: `${syncResult.message}. ${embeddingResult.message}`,
        stats: {
          ...syncResult.stats,
          embeddings_generated: embeddingResult.entities_processed
        }
      }

    } catch (error) {
      console.error('Scheduled sync failed:', error)
      return {
        success: false,
        message: `Scheduled sync failed: ${error.message}`,
        stats: {}
      }
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const scheduler = new SyncScheduler()
    const result = await scheduler.runScheduledSync()

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 500,
      }
    )
  } catch (error) {
    console.error('Scheduler error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        message: `Scheduler error: ${error.message}`,
        stats: {}
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
