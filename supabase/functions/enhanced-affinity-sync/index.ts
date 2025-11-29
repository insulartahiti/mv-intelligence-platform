import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AffinityOrganization {
  id: number
  name: string
  domain: string
  industry: string
  pipeline_stage: string
  fund: string
  taxonomy: string
  valuation_amount: number
  investment_amount: number
  year_founded: number
  employee_count: number
  location_city: string
  location_country: string
  urgency: string
  series: string
  founder_gender: string
  pass_lost_reason: string
  sourced_by: string
  notion_page: string
  related_deals: string[]
  apollo_taxonomy: string
  brief_description: string
  created_at: string
  updated_at: string
}

interface AffinityPerson {
  id: number
  first_name: string
  last_name: string
  emails: string[]
  phone_numbers: string[]
  organization_ids: number[]
  title: string
  linkedin_url: string
  created_at: string
  updated_at: string
}

interface SyncState {
  last_sync_timestamp: string
  entities_synced: number
  rate_limit_remaining: number
  next_sync_allowed: string
  last_incremental_sync: string
  sync_type: 'full' | 'incremental'
}

interface ChangeDetection {
  hasChanges: boolean
  changedFields: string[]
  changeType: 'created' | 'updated' | 'deleted' | 'unchanged'
}

class EnhancedAffinitySyncService {
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

  private async makeAffinityRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
    const url = new URL(`https://api.affinity.co${path}`)
    
    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Basic ${btoa(':' + this.affinityApiKey)}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
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
          last_incremental_sync: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
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

  private detectChanges(newData: any, existingData: any): ChangeDetection {
    if (!existingData) {
      return {
        hasChanges: true,
        changedFields: Object.keys(newData),
        changeType: 'created'
      }
    }

    const fieldsToCheck = [
      'name', 'domain', 'industry', 'pipeline_stage', 'fund', 'taxonomy',
      'valuation_amount', 'investment_amount', 'year_founded', 'employee_count',
      'location_city', 'location_country', 'urgency', 'series', 'founder_gender',
      'pass_lost_reason', 'sourced_by', 'notion_page', 'related_deals',
      'apollo_taxonomy', 'brief_description'
    ]

    const changedFields: string[] = []
    
    for (const field of fieldsToCheck) {
      if (newData[field] !== existingData[field]) {
        changedFields.push(field)
      }
    }

    return {
      hasChanges: changedFields.length > 0,
      changedFields,
      changeType: changedFields.length > 0 ? 'updated' : 'unchanged'
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

  private async fetchOrganizationsIncremental(lastSyncTimestamp: string, limit: number = 100): Promise<AffinityOrganization[]> {
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

  private async fetchPersonsIncremental(lastSyncTimestamp: string, limit: number = 100): Promise<AffinityPerson[]> {
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

  private async processOrganizationIncremental(org: AffinityOrganization): Promise<{ processed: boolean; changes: ChangeDetection }> {
    try {
      const orgEntityId = await this.generateEntityId(org.name, 'organization', org.domain)
      
      // Check if organization already exists
      const { data: existingEntity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', orgEntityId)
        .single()

      // Detect changes
      const changeDetection = this.detectChanges(org, existingEntity)
      
      if (!changeDetection.hasChanges && existingEntity) {
        console.log(`No changes detected for organization: ${org.name}`)
        return { processed: false, changes: changeDetection }
      }

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
        source: 'affinity_api_sync',
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

      // Create edges for this organization (temporarily disabled for debugging)
      // await this.createOrganizationEdges(org, orgEntityId)

      console.log(`${changeDetection.changeType === 'created' ? 'Created' : 'Updated'} organization: ${org.name} (${changeDetection.changedFields.length} fields changed)`)
      
      return { processed: true, changes: changeDetection }
    } catch (error) {
      console.error(`Error processing organization ${org.name}:`, error)
      return { processed: false, changes: { hasChanges: false, changedFields: [], changeType: 'unchanged' } }
    }
  }

  private async processPersonIncremental(person: AffinityPerson): Promise<{ processed: boolean; changes: ChangeDetection }> {
    try {
      const fullName = `${person.first_name} ${person.last_name}`.trim()
      const personEntityId = await this.generateEntityId(fullName, 'person')
      
      // Check if person already exists
      const { data: existingEntity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', personEntityId)
        .single()

      // Detect changes
      const changeDetection = this.detectChanges(person, existingEntity)
      
      if (!changeDetection.hasChanges && existingEntity) {
        console.log(`No changes detected for person: ${fullName}`)
        return { processed: false, changes: changeDetection }
      }

      // Create/update person entity
      const personEntity = {
        id: personEntityId,
        name: fullName,
        type: 'person',
        email: person.emails?.[0] || null,
        title: person.title,
        linkedin_url: person.linkedin_url,
        affinity_person_id: person.id,
        source: 'affinity_api_sync',
        last_synced_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_internal: false
      }

      await this.supabase
        .schema('graph')
        .from('entities')
        .upsert(personEntity, { onConflict: 'id' })

      console.log(`${changeDetection.changeType === 'created' ? 'Created' : 'Updated'} person: ${fullName} (${changeDetection.changedFields.length} fields changed)`)
      
      return { processed: true, changes: changeDetection }
    } catch (error) {
      console.error(`Error processing person ${person.first_name} ${person.last_name}:`, error)
      return { processed: false, changes: { hasChanges: false, changedFields: [], changeType: 'unchanged' } }
    }
  }

  private async generateEntityId(name: string, type: string, domain?: string): Promise<string> {
    const crypto = await import('https://deno.land/std@0.168.0/crypto/mod.ts')
    const encoder = new TextEncoder()
    const data = encoder.encode(`${name}-${type}-${domain || ''}`)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex.substring(0, 32)
  }

  private async upsertEdge(edge: any): Promise<void> {
    await this.supabase
      .schema('graph')
      .from('edges')
      .upsert(edge, { onConflict: 'id' })
  }

  private async createOrganizationEdges(org: AffinityOrganization, orgEntityId: string): Promise<void> {
    try {
      // Create edges for owners
      for (const owner of org.owners || []) {
        const personEntityId = await this.generateEntityId(owner.name, 'person', owner.email)
        const edgeId = await this.generateEntityId(`${owner.name}-${org.name}`, 'edge', 'owner')
        
        await this.upsertEdge({
          id: edgeId,
          source: personEntityId,
          target: orgEntityId,
          kind: 'owner',
          strength_score: 0.9,
          source_type: 'affinity_api_sync'
        })
      }

      // Create edges for deal team
      for (const member of org.deal_team || []) {
        const personEntityId = await this.generateEntityId(member.name, 'person', member.email)
        const edgeId = await this.generateEntityId(`${member.name}-${org.name}`, 'edge', 'deal_team')
        
        await this.upsertEdge({
          id: edgeId,
          source: personEntityId,
          target: orgEntityId,
          kind: 'deal_team',
          strength_score: 0.8,
          source_type: 'affinity_api_sync'
        })
      }

      // Create edges for other people
      for (const person of org.people || []) {
        const personEntityId = await this.generateEntityId(person.name, 'person', person.email)
        const edgeId = await this.generateEntityId(`${person.name}-${org.name}`, 'edge', 'contact')
        
        await this.upsertEdge({
          id: edgeId,
          source: personEntityId,
          target: orgEntityId,
          kind: 'contact',
          strength_score: 0.5,
          source_type: 'affinity_api_sync'
        })
      }

      console.log(`Created edges for organization: ${org.name}`)
    } catch (error) {
      console.error(`Error creating edges for organization ${org.name}:`, error)
    }
  }


  async runIncrementalSync(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting incremental Affinity sync...')
      
      const syncState = await this.getSyncState()
      if (!syncState) {
        throw new Error('Failed to get sync state')
      }

      const lastSync = new Date(syncState.last_incremental_sync)
      const now = new Date()
      
      // Check if we should run sync
      if (now < new Date(syncState.next_sync_allowed)) {
        return {
          success: false,
          message: `Rate limited. Next sync allowed at: ${syncState.next_sync_allowed}`,
          stats: {}
        }
      }

      let totalProcessed = 0
      let totalOrganizations = 0
      let totalPersons = 0
      let organizationsChanged = 0
      let personsChanged = 0

      // Fetch incremental organizations
      console.log('Fetching incremental organizations...')
      const organizations = await this.fetchOrganizationsIncremental(syncState.last_incremental_sync, 100)
      totalOrganizations = organizations.length

      for (const org of organizations) {
        const result = await this.processOrganizationIncremental(org)
        if (result.processed) {
          organizationsChanged++
          totalProcessed++
        }
      }

      // Fetch incremental persons
      console.log('Fetching incremental persons...')
      const persons = await this.fetchPersonsIncremental(syncState.last_incremental_sync, 100)
      totalPersons = persons.length

      for (const person of persons) {
        const result = await this.processPersonIncremental(person)
        if (result.processed) {
          personsChanged++
          totalProcessed++
        }
      }

      // Update sync state
      await this.updateSyncState({
        last_incremental_sync: now.toISOString(),
        entities_synced: syncState.entities_synced + totalProcessed,
        rate_limit_remaining: this.rateLimitRemaining,
        next_sync_allowed: this.nextSyncAllowed.toISOString(),
        sync_type: 'incremental'
      })

      console.log(`Incremental sync completed. Processed ${totalProcessed} entities (${organizationsChanged} orgs, ${personsChanged} persons changed)`)

      return {
        success: true,
        message: `Incremental sync completed. ${totalProcessed} entities processed`,
        stats: {
          total_organizations: totalOrganizations,
          total_persons: totalPersons,
          organizations_changed: organizationsChanged,
          persons_changed: personsChanged,
          total_processed: totalProcessed,
          rate_limit_remaining: this.rateLimitRemaining
        }
      }
    } catch (error) {
      console.error('Incremental sync error:', error)
      return {
        success: false,
        message: `Incremental sync failed: ${error.message}`,
        stats: {}
      }
    }
  }

  async runFullSync(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting full Affinity sync...')
      
      const batchSize = 50 // Increased batch size for production
      const maxOrganizations = 1000 // Increased limit for production
      let offset = 0
      let totalProcessed = 0
      let totalOrganizations = 0

      while (totalOrganizations < maxOrganizations) {
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

        totalOrganizations += organizations.length

        // Process each organization
        for (const org of organizations) {
          try {
            const result = await this.processOrganizationIncremental(org)
            if (result.processed) {
              totalProcessed++
            }
            console.log(`Processed organization: ${org.name} (${totalProcessed}/${totalOrganizations})`)
          } catch (error) {
            console.error(`Error processing organization ${org.name}:`, error)
          }
        }

        // Update sync state
        await this.updateSyncState({
          last_sync_timestamp: new Date().toISOString(),
          entities_synced: totalProcessed,
          rate_limit_remaining: this.rateLimitRemaining,
          next_sync_allowed: this.nextSyncAllowed.toISOString(),
          sync_type: 'full'
        })

        offset += batchSize

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      console.log(`Full sync completed. Processed ${totalProcessed} organizations.`)

      return {
        success: true,
        message: `Full sync completed. Processed ${totalProcessed} organizations`,
        stats: {
          total_organizations: totalOrganizations,
          total_processed: totalProcessed,
          rate_limit_remaining: this.rateLimitRemaining
        }
      }
    } catch (error) {
      console.error('Full sync error:', error)
      return {
        success: false,
        message: `Full sync failed: ${error.message}`,
        stats: {}
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action = 'incremental' } = await req.json()
    
    const syncService = new EnhancedAffinitySyncService()
    
    let result
    if (action === 'full') {
      result = await syncService.runFullSync()
    } else {
      result = await syncService.runIncrementalSync()
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 500,
      }
    )
  } catch (error) {
    console.error('Sync function error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
