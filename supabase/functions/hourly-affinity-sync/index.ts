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
  sync_type: 'full' | 'incremental'
}

interface SyncResult {
  success: boolean
  message: string
  stats: {
    entities_processed: number
    entities_created: number
    entities_updated: number
    entities_unchanged: number
    processing_time_ms: number
    rate_limit_remaining: number
  }
}

class HourlySyncService {
  private supabase: any
  private affinityApiKey: string
  private affinityOrgId: string
  private rateLimitRemaining: number = 300
  private nextSyncAllowed: Date = new Date()

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    this.affinityApiKey = Deno.env.get('AFFINITY_API_KEY') ?? ''
    this.affinityOrgId = Deno.env.get('AFFINITY_ORG_ID') ?? '7624528'
  }

  private async makeAffinityRequest(path: string): Promise<any> {
    const response = await fetch(`https://api.affinity.co${path}`, {
      headers: {
        'Authorization': `Basic ${btoa(':' + this.affinityApiKey)}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Affinity API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    // Update rate limit tracking
    this.rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '300')
    const resetTime = response.headers.get('X-RateLimit-Reset')
    if (resetTime) {
      this.nextSyncAllowed = new Date(parseInt(resetTime) * 1000)
    }

    return await response.json()
  }

  private async getSyncState(): Promise<SyncState | null> {
    try {
      const { data, error } = await this.supabase
        .schema('graph')
        .from('sync_state')
        .select('*')
        .single()

      if (error) {
        console.log('No existing sync state, creating default')
        return {
          last_sync_timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
          entities_synced: 0,
          rate_limit_remaining: 300,
          next_sync_allowed: new Date().toISOString(),
          sync_type: 'incremental'
        }
      }

      return data
    } catch (error) {
      console.error('Error getting sync state:', error)
      return null
    }
  }

  private async updateSyncState(state: Partial<SyncState>): Promise<void> {
    try {
      await this.supabase
        .schema('graph')
        .from('sync_state')
        .upsert({
          id: 1,
          ...state,
          updated_at: new Date().toISOString()
        })
    } catch (error) {
      console.error('Error updating sync state:', error)
    }
  }

  private async generateEntityId(name: string, type: string, domain?: string): Promise<string> {
    const input = `${name}-${type}-${domain || ''}`
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex.substring(0, 8) + '-' + hashHex.substring(8, 12) + '-' + hashHex.substring(12, 16) + '-' + hashHex.substring(16, 20) + '-' + hashHex.substring(20, 32)
  }

  private async shouldRunSync(): Promise<boolean> {
    const syncState = await this.getSyncState()
    if (!syncState) return true

    const lastSync = new Date(syncState.last_sync_timestamp)
    const now = new Date()
    const timeSinceLastSync = now.getTime() - lastSync.getTime()
    
    // Run sync if it's been more than 1 hour since last sync
    return timeSinceLastSync > 60 * 60 * 1000
  }

  private async fetchOrganizationsIncremental(lastSyncTimestamp: string, limit: number = 100): Promise<any[]> {
    try {
      const url = new URL('https://api.affinity.co/organizations')
      url.searchParams.set('limit', limit.toString())
      url.searchParams.set('updated_since', lastSyncTimestamp)
      
      console.log(`Fetching organizations updated since: ${lastSyncTimestamp}`)
      
      const response = await this.makeAffinityRequest(url.pathname + url.search)
      
      if (response.organizations) {
        console.log(`Found ${response.organizations.length} updated organizations`)
        return response.organizations
      }
      
      return []
    } catch (error) {
      console.error('Error fetching incremental organizations:', error)
      return []
    }
  }

  private async fetchPersonsIncremental(lastSyncTimestamp: string, limit: number = 100): Promise<any[]> {
    try {
      const url = new URL('https://api.affinity.co/persons')
      url.searchParams.set('limit', limit.toString())
      url.searchParams.set('updated_since', lastSyncTimestamp)
      
      console.log(`Fetching persons updated since: ${lastSyncTimestamp}`)
      
      const response = await this.makeAffinityRequest(url.pathname + url.search)
      
      if (response.persons) {
        console.log(`Found ${response.persons.length} updated persons`)
        return response.persons
      }
      
      return []
    } catch (error) {
      console.error('Error fetching incremental persons:', error)
      return []
    }
  }

  private async processOrganization(org: any): Promise<{ processed: boolean; changeType: string }> {
    try {
      const orgEntityId = await this.generateEntityId(org.name, 'organization', org.domain)
      
      // Check if organization already exists
      const { data: existingEntity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', orgEntityId)
        .single()

      const changeType = existingEntity ? 'updated' : 'created'
      
      // Create/update organization entity
      const orgEntity = {
        id: orgEntityId,
        name: org.name,
        type: 'organization',
        domain: org.domain,
        industry: org.industry,
        pipeline_stage: org.pipeline_stage,
        fund: org.fund,
        taxonomy: org.taxonomy,
        valuation_amount: org.valuation_amount,
        investment_amount: org.investment_amount,
        year_founded: org.year_founded,
        employee_count: org.employee_count,
        location_city: org.location_city,
        location_country: org.location_country,
        urgency: org.urgency,
        series: org.series,
        founder_gender: org.founder_gender,
        pass_lost_reason: org.pass_lost_reason,
        sourced_by: org.sourced_by,
        notion_page: org.notion_page,
        related_deals: org.related_deals || [],
        apollo_taxonomy: org.apollo_taxonomy,
        brief_description: org.brief_description,
        affinity_org_id: org.id,
        source: 'affinity_hourly_sync',
        last_synced_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_internal: false,
        is_portfolio: org.fund ? true : false,
        is_pipeline: org.pipeline_stage ? true : false
      }

      await this.supabase
        .schema('graph')
        .from('entities')
        .upsert(orgEntity, { onConflict: 'id' })

      console.log(`${changeType} organization: ${org.name}`)
      
      return { processed: true, changeType }
    } catch (error) {
      console.error(`Error processing organization ${org.name}:`, error)
      return { processed: false, changeType: 'error' }
    }
  }

  private async processPerson(person: any): Promise<{ processed: boolean; changeType: string }> {
    try {
      const fullName = `${person.first_name || ''} ${person.last_name || ''}`.trim()
      const personEntityId = await this.generateEntityId(fullName, 'person')
      
      // Check if person already exists
      const { data: existingEntity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', personEntityId)
        .single()

      const changeType = existingEntity ? 'updated' : 'created'
      
      // Create/update person entity
      const personEntity = {
        id: personEntityId,
        name: fullName,
        type: 'person',
        email: person.emails?.[0] || null,
        title: person.title,
        linkedin_url: person.linkedin_url,
        affinity_person_id: person.id,
        source: 'affinity_hourly_sync',
        last_synced_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_internal: false
      }

      await this.supabase
        .schema('graph')
        .from('entities')
        .upsert(personEntity, { onConflict: 'id' })

      console.log(`${changeType} person: ${fullName}`)
      
      return { processed: true, changeType }
    } catch (error) {
      console.error(`Error processing person ${person.first_name} ${person.last_name}:`, error)
      return { processed: false, changeType: 'error' }
    }
  }

  async runHourlySync(): Promise<SyncResult> {
    const startTime = Date.now()
    
    try {
      console.log('Starting hourly Affinity sync...')
      
      // Check if sync should run
      const shouldRun = await this.shouldRunSync()
      if (!shouldRun) {
        return {
          success: true,
          message: 'Sync not needed - last sync was less than 1 hour ago',
          stats: {
            entities_processed: 0,
            entities_created: 0,
            entities_updated: 0,
            entities_unchanged: 0,
            processing_time_ms: 0,
            rate_limit_remaining: this.rateLimitRemaining
          }
        }
      }

      const syncState = await this.getSyncState()
      if (!syncState) {
        throw new Error('Failed to get sync state')
      }

      let entitiesProcessed = 0
      let entitiesCreated = 0
      let entitiesUpdated = 0
      let entitiesUnchanged = 0

      // Fetch incremental organizations
      console.log('Fetching incremental organizations...')
      const organizations = await this.fetchOrganizationsIncremental(syncState.last_sync_timestamp, 100)

      for (const org of organizations) {
        const result = await this.processOrganization(org)
        if (result.processed) {
          entitiesProcessed++
          if (result.changeType === 'created') {
            entitiesCreated++
          } else if (result.changeType === 'updated') {
            entitiesUpdated++
          }
        } else {
          entitiesUnchanged++
        }
      }

      // Fetch incremental persons
      console.log('Fetching incremental persons...')
      const persons = await this.fetchPersonsIncremental(syncState.last_sync_timestamp, 100)

      for (const person of persons) {
        const result = await this.processPerson(person)
        if (result.processed) {
          entitiesProcessed++
          if (result.changeType === 'created') {
            entitiesCreated++
          } else if (result.changeType === 'updated') {
            entitiesUpdated++
          }
        } else {
          entitiesUnchanged++
        }
      }

      // Update sync state
      const now = new Date()
      await this.updateSyncState({
        last_sync_timestamp: now.toISOString(),
        entities_synced: syncState.entities_synced + entitiesProcessed,
        rate_limit_remaining: this.rateLimitRemaining,
        next_sync_allowed: this.nextSyncAllowed.toISOString(),
        sync_type: 'incremental'
      })

      const processingTime = Date.now() - startTime
      console.log(`Hourly sync completed. Processed ${entitiesProcessed} entities in ${processingTime}ms`)

      return {
        success: true,
        message: `Hourly sync completed. Processed ${entitiesProcessed} entities`,
        stats: {
          entities_processed: entitiesProcessed,
          entities_created: entitiesCreated,
          entities_updated: entitiesUpdated,
          entities_unchanged: entitiesUnchanged,
          processing_time_ms: processingTime,
          rate_limit_remaining: this.rateLimitRemaining
        }
      }
    } catch (error) {
      console.error('Hourly sync error:', error)
      return {
        success: false,
        message: `Hourly sync failed: ${error.message}`,
        stats: {
          entities_processed: 0,
          entities_created: 0,
          entities_updated: 0,
          entities_unchanged: 0,
          processing_time_ms: Date.now() - startTime,
          rate_limit_remaining: this.rateLimitRemaining
        }
      }
    }
  }

  async runFullSync(): Promise<SyncResult> {
    const startTime = Date.now()
    
    try {
      console.log('Starting full Affinity sync...')
      
      const batchSize = 50
      const maxOrganizations = 1000
      let offset = 0
      let entitiesProcessed = 0
      let entitiesCreated = 0
      let entitiesUpdated = 0

      while (entitiesProcessed < maxOrganizations) {
        console.log(`Fetching batch starting at offset ${offset}...`)
        
        const url = new URL('https://api.affinity.co/organizations')
        url.searchParams.set('limit', batchSize.toString())
        url.searchParams.set('offset', offset.toString())
        
        const response = await this.makeAffinityRequest(url.pathname + url.search)
        const organizations = response.organizations || []
        
        if (organizations.length === 0) {
          console.log('No more organizations found, breaking loop')
          break
        }

        // Process each organization
        for (const org of organizations) {
          try {
            const result = await this.processOrganization(org)
            if (result.processed) {
              entitiesProcessed++
              if (result.changeType === 'created') {
                entitiesCreated++
              } else if (result.changeType === 'updated') {
                entitiesUpdated++
              }
            }
            console.log(`Processed organization: ${org.name} (${entitiesProcessed}/${maxOrganizations})`)
          } catch (error) {
            console.error(`Error processing organization ${org.name}:`, error)
          }
        }

        offset += batchSize

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Update sync state
      const now = new Date()
      await this.updateSyncState({
        last_sync_timestamp: now.toISOString(),
        entities_synced: entitiesProcessed,
        rate_limit_remaining: this.rateLimitRemaining,
        next_sync_allowed: this.nextSyncAllowed.toISOString(),
        sync_type: 'full'
      })

      const processingTime = Date.now() - startTime
      console.log(`Full sync completed. Processed ${entitiesProcessed} organizations in ${processingTime}ms`)

      return {
        success: true,
        message: `Full sync completed. Processed ${entitiesProcessed} organizations`,
        stats: {
          entities_processed: entitiesProcessed,
          entities_created: entitiesCreated,
          entities_updated: entitiesUpdated,
          entities_unchanged: 0,
          processing_time_ms: processingTime,
          rate_limit_remaining: this.rateLimitRemaining
        }
      }
    } catch (error) {
      console.error('Full sync error:', error)
      return {
        success: false,
        message: `Full sync failed: ${error.message}`,
        stats: {
          entities_processed: 0,
          entities_created: 0,
          entities_updated: 0,
          entities_unchanged: 0,
          processing_time_ms: Date.now() - startTime,
          rate_limit_remaining: this.rateLimitRemaining
        }
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action = 'hourly' } = await req.json()
    
    const syncService = new HourlySyncService()
    
    let result
    if (action === 'full') {
      result = await syncService.runFullSync()
    } else {
      result = await syncService.runHourlySync()
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 500,
      }
    )
  } catch (error) {
    console.error('Hourly sync function error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
