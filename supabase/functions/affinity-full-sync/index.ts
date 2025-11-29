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
  status: string
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
  related_deals: string
  apollo_taxonomy: string
  brief_description: string
  owners: AffinityPerson[]
  deal_team: AffinityPerson[]
  people: AffinityPerson[]
  interactions: AffinityInteraction[]
  files: AffinityFile[]
}

interface AffinityPerson {
  id: number
  name: string
  email: string
  title: string
  company: string
  linkedin_url: string
  phone: string
  location: string
  bio: string
  first_degree_connections: number
}

interface AffinityInteraction {
  id: number
  type: string
  subject: string
  content: string
  date: string
  person_id: number
  organization_id: number
}

interface AffinityFile {
  id: number
  name: string
  url: string
  size_bytes: number
  created_at: string
  organization_id: number
  person_id?: number
}

interface SyncState {
  last_sync_timestamp: string
  entities_synced: number
  rate_limit_remaining: number
  next_sync_allowed: string
  current_batch: number
  total_batches: number
}

class AffinitySyncService {
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
    
    // Debug logging for environment variables
    console.log('Environment check:')
    console.log('- AFFINITY_API_KEY exists:', !!Deno.env.get('AFFINITY_API_KEY'))
    console.log('- AFFINITY_API_KEY length:', this.affinityApiKey.length)
    console.log('- AFFINITY_ORG_ID:', this.affinityOrgId)
    
    if (!this.affinityApiKey) {
      throw new Error('AFFINITY_API_KEY environment variable is not set')
    }
  }

  async makeAffinityRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    // Check rate limit
    if (this.rateLimitRemaining <= 0) {
      const now = new Date()
      if (now < this.nextSyncAllowed) {
        const waitTime = this.nextSyncAllowed.getTime() - now.getTime()
        console.log(`Rate limit exceeded. Waiting ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
      this.rateLimitRemaining = 300
    }

    const url = new URL(`https://api.affinity.co${endpoint}`)
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString())
      }
    })

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Basic ${btoa(':' + this.affinityApiKey)}`,
        'Content-Type': 'application/json',
      },
    })

    // Update rate limit from headers
    const remaining = response.headers.get('X-RateLimit-Remaining')
    if (remaining) {
      this.rateLimitRemaining = parseInt(remaining)
    }

    const resetTime = response.headers.get('X-RateLimit-Reset')
    if (resetTime) {
      this.nextSyncAllowed = new Date(parseInt(resetTime) * 1000)
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Affinity API error details:')
      console.error('- Status:', response.status)
      console.error('- Status Text:', response.statusText)
      console.error('- Response Body:', errorText)
      console.error('- Request URL:', url.toString())
      console.error('- Authorization Header:', `Basic ${btoa(':' + this.affinityApiKey).substring(0, 20)}...`)
      throw new Error(`Affinity API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const responseData = await response.json()
    console.log(`API Response for ${endpoint}:`, JSON.stringify(responseData).substring(0, 200) + '...')
    return responseData
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
      next_sync_allowed: new Date().toISOString()
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

  async fetchOrganizations(limit: number = 50, offset: number = 0): Promise<AffinityOrganization[]> {
    console.log(`Fetching organizations: limit=${limit}, offset=${offset}`)
    
    try {
      const url = `https://api.affinity.co/organizations?limit=${limit}&offset=${offset}`
      console.log(`Making request to: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${btoa(':' + this.affinityApiKey)}`,
          'Content-Type': 'application/json',
        },
      })
      
      console.log(`Response status: ${response.status}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        throw new Error(`Affinity API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log(`API Response received: ${data.organizations?.length || 0} organizations`)
      
      const organizations: AffinityOrganization[] = []

      console.log(`Processing ${data.organizations?.length || 0} organizations from API response`)
      
      // For now, let's just return a simple organization structure to test
      for (const org of data.organizations || []) {
        try {
          organizations.push({
            id: org.id,
            name: org.name,
            domain: org.domain || '',
            industry: '',
            status: '',
            pipeline_stage: '',
            fund: '',
            taxonomy: '',
            valuation_amount: 0,
            investment_amount: 0,
            year_founded: 0,
            employee_count: 0,
            location_city: '',
            location_country: '',
            urgency: '',
            series: '',
            founder_gender: '',
            pass_lost_reason: '',
            sourced_by: '',
            notion_page: '',
            related_deals: '',
            apollo_taxonomy: '',
            brief_description: '',
            owners: [],
            deal_team: [],
            people: [],
            interactions: [],
            files: []
          })
        } catch (error) {
          console.error(`Error processing organization ${org.id}:`, error)
          // Continue with other organizations
        }
      }
      
      console.log(`Successfully processed ${organizations.length} organizations`)
      return organizations
    } catch (error) {
      console.error('Error in fetchOrganizations:', error)
      return []
    }
  }

  async fetchOrganizationPeople(orgId: number, type: string): Promise<AffinityPerson[]> {
    // v1 API doesn't have people endpoints - return empty array
    console.log(`Skipping ${type} for org ${orgId} - v1 API doesn't support people endpoints`)
    return []
  }

  async fetchOrganizationInteractions(orgId: number): Promise<AffinityInteraction[]> {
    try {
      // v1 API interactions endpoint requires type parameter (integer)
      // Common types: 1=email, 2=meeting, 3=call, 4=note
      const endTime = new Date()
      const startTime = new Date('2020-01-01') // Full history from 2020
      
      const interactionTypes = [1, 2, 3, 4] // email, meeting, call, note
      const allInteractions: AffinityInteraction[] = []
      
      for (const type of interactionTypes) {
        try {
          const response = await this.makeAffinityRequest(
            `/interactions?organization_id=${orgId}&type=${type}&start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}`
          )
          
          if (response.interactions) {
            const interactions = response.interactions.map((interaction: any) => ({
              id: interaction.id,
              type: this.getInteractionTypeName(type),
              subject: interaction.subject || '',
              content: interaction.content || '',
              date: interaction.date,
              person_id: interaction.person_id,
              organization_id: interaction.organization_id
            }))
            allInteractions.push(...interactions)
          }
        } catch (error) {
          console.log(`No interactions of type ${type} for org ${orgId}`)
        }
      }
      
      return allInteractions
    } catch (error) {
      console.error(`Error fetching interactions for org ${orgId}:`, error)
      return []
    }
  }

  private getInteractionTypeName(type: number): string {
    const typeMap: { [key: number]: string } = {
      1: 'email',
      2: 'meeting', 
      3: 'call',
      4: 'note'
    }
    return typeMap[type] || 'unknown'
  }

  async fetchOrganizationFiles(orgId: number): Promise<AffinityFile[]> {
    // Files API endpoint not available in Affinity v1
    console.log(`Skipping files for org ${orgId} - files API not available`)
    return []
  }

  async fetchOrganizationNotes(orgId: number): Promise<any[]> {
    try {
      const response = await this.makeAffinityRequest(`/notes?organization_id=${orgId}`)
      
      if (response.notes) {
        return response.notes.map((note: any) => ({
          id: note.id,
          content: note.content,
          created_at: note.created_at,
          organization_id: note.organization_id,
          person_id: note.person_id
        }))
      }
      
      return []
    } catch (error) {
      console.error(`Error fetching notes for org ${orgId}:`, error)
      return []
    }
  }

  async generateEntityId(name: string, type: string, domain?: string): Promise<string> {
    const input = `${name}-${type}-${domain || ''}`
    // Use Web Crypto API for Deno compatibility
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return `${hashHex.substring(0, 8)}-${hashHex.substring(8, 12)}-${hashHex.substring(12, 16)}-${hashHex.substring(16, 20)}-${hashHex.substring(20, 32)}`
  }

  async upsertEntity(entity: any): Promise<void> {
    const { error } = await this.supabase
      .schema('graph')
      .from('entities')
      .upsert(entity, { onConflict: 'id' })

    if (error) {
      console.error('Error upserting entity:', error)
      throw error
    }
  }

  async upsertEdge(edge: any): Promise<void> {
    const { error } = await this.supabase
      .schema('graph')
      .from('edges')
      .upsert(edge, { onConflict: 'id' })

    if (error) {
      console.error('Error upserting edge:', error)
      throw error
    }
  }

  async storeInteraction(interaction: AffinityInteraction, entityId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('graph')
      .from('interactions')
      .upsert({
        id: interaction.id.toString(),
        entity_id: entityId,
        interaction_type: interaction.type,
        subject: interaction.subject,
        content: interaction.content,
        interaction_date: interaction.date,
        affinity_interaction_id: interaction.id,
        source_type: 'affinity_api_sync'
      }, { onConflict: 'id' })

    if (error) {
      console.error('Error storing interaction:', error)
    }
  }

  async storeFile(file: AffinityFile, entityId: string): Promise<void> {
    const { error } = await this.supabase
      .schema('graph')
      .from('affinity_files')
      .upsert({
        id: file.id.toString(),
        entity_id: entityId,
        affinity_file_id: file.id,
        name: file.name,
        url: file.url,
        size_bytes: file.size_bytes,
        created_at: file.created_at,
        processed: false
      }, { onConflict: 'id' })

    if (error) {
      console.error('Error storing file:', error)
    }
  }

  async storeNotesRollup(notes: any[], entityId: string): Promise<void> {
    const latestSummary = notes
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
      .map(note => note.content)
      .join(' ')

    const { error } = await this.supabase
      .schema('graph')
      .from('entity_notes_rollup')
      .upsert({
        entity_id: entityId,
        latest_summary: latestSummary,
        notes_count: notes.length,
        last_updated: new Date().toISOString()
      }, { onConflict: 'entity_id' })

    if (error) {
      console.error('Error storing notes rollup:', error)
    }
  }

  async processOrganizationFiles(orgId: number): Promise<void> {
    try {
      // Call the file processing function
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-affinity-files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entityId: orgId,
          entityType: 'organization'
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('File processing error:', errorText)
        return
      }

      const result = await response.json()
      console.log(`File processing result for org ${orgId}:`, result.message)
    } catch (error) {
      console.error(`Error processing files for org ${orgId}:`, error)
    }
  }

  async processOrganization(org: AffinityOrganization): Promise<void> {
    // Create organization entity with comprehensive enrichment fields
    const orgEntity = {
      id: await this.generateEntityId(org.name, 'organization', org.domain),
      name: org.name,
      type: 'organization',
      
      // Basic entity info
      domain: org.domain,
      industry: org.industry,
      company_type: '',
      website: org.domain ? `https://${org.domain}` : '',
      description: org.brief_description,
      
      // Affinity CRM integration
      affinity_org_id: org.id,
      
      // Pipeline and deal information
      pipeline_stage: org.pipeline_stage,
      fund: org.fund,
      taxonomy: org.taxonomy,
      valuation_amount: org.valuation_amount,
      investment_amount: org.investment_amount,
      year_founded: org.year_founded,
      employee_count: org.employee_count,
      
      // Location
      location_city: org.location_city,
      location_country: org.location_country,
      
      // Deal-specific fields
      urgency: org.urgency,
      series: org.series,
      founder_gender: org.founder_gender,
      pass_lost_reason: org.pass_lost_reason,
      sourced_by: org.sourced_by,
      notion_page: org.notion_page,
      related_deals: org.related_deals || [],
      apollo_taxonomy: org.apollo_taxonomy,
      brief_description: org.brief_description,
      
      // Metadata and tracking
      source: 'affinity_api_sync',
      enriched: false,
      last_synced_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      
      // Importance and scoring
      importance: 0.5,
      relevance_score: 0.5,
      confidence_score: 0.5,
      
      // Status and flags
      is_active: true,
      is_internal: false,
      is_portfolio: org.fund ? true : false,
      is_pipeline: org.pipeline_stage ? true : false
    }

    await this.upsertEntity(orgEntity)
    
    // Fetch and store interactions, notes, and files
    try {
      const [interactions, notes] = await Promise.all([
        this.fetchOrganizationInteractions(org.id),
        this.fetchOrganizationNotes(org.id)
      ])

      // Store interactions
      for (const interaction of interactions) {
        await this.storeInteraction(interaction, orgEntity.id)
      }

      // Store notes rollup
      if (notes.length > 0) {
        await this.storeNotesRollup(notes, orgEntity.id)
      }

      // Process files (download, analyze, store summaries)
      await this.processOrganizationFiles(org.id)

      console.log(`Successfully processed organization: ${org.name} with ${interactions.length} interactions, ${notes.length} notes`)
    } catch (error) {
      console.error(`Error processing additional data for ${org.name}:`, error)
    }
  }

  async processPerson(person: AffinityPerson, orgId: number): Promise<void> {
    const personEntity = {
      id: await this.generateEntityId(person.name, 'person', person.email),
      name: person.name,
      type: 'person',
      domain: person.email ? person.email.split('@')[1] : undefined,
      title: person.title,
      linkedin_url: person.linkedin_url,
      phone: person.phone,
      location: person.location,
      bio: person.bio,
      source: 'affinity_api_sync',
      affinity_person_id: person.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    await this.upsertEntity(personEntity)
  }

  async createOrganizationEdges(org: AffinityOrganization, orgEntityId: string): Promise<void> {
    // Create edges for owners
    for (const owner of org.owners) {
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
    for (const member of org.deal_team) {
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
    for (const person of org.people) {
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
  }

  async runFullSync(): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      console.log('Starting full Affinity sync...')
      
      // Skip sync state check for now to debug
      console.log('Skipping sync state check for debugging')
      
      const batchSize = 2 // Process 2 organizations at a time to avoid compute limits
      const maxOrganizations = 10 // Limit total organizations to avoid compute limits
      let offset = 0
      let totalProcessed = 0
      let totalOrganizations = 0

      while (totalOrganizations < maxOrganizations) {
        console.log(`Fetching batch starting at offset ${offset}...`)
        console.log(`About to call fetchOrganizations with limit=${batchSize}, offset=${offset}`)
        const organizations = await this.fetchOrganizations(batchSize, offset)
        console.log(`Fetched ${organizations.length} organizations from API`)
        
        if (organizations.length === 0) {
          console.log('No more organizations found, breaking loop')
          break
        }

        totalOrganizations += organizations.length

        // Process each organization
        for (const org of organizations) {
          try {
            await this.processOrganization(org)
            totalProcessed++
            console.log(`Processed organization: ${org.name} (${totalProcessed}/${totalOrganizations})`)
          } catch (error) {
            console.error(`Error processing organization ${org.name}:`, error)
            // Continue with next organization
          }
        }

        // Update sync state
        await this.updateSyncState({
          last_sync_timestamp: new Date().toISOString(),
          entities_synced: totalProcessed,
          rate_limit_remaining: this.rateLimitRemaining,
          next_sync_allowed: this.nextSyncAllowed.toISOString()
        })

        offset += batchSize

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      console.log(`Full sync completed. Processed ${totalProcessed} organizations.`)

      return {
        success: true,
        message: `Successfully synced ${totalProcessed} organizations from Affinity`,
        stats: {
          organizations_processed: totalProcessed,
          rate_limit_remaining: this.rateLimitRemaining,
          next_sync_allowed: this.nextSyncAllowed.toISOString()
        }
      }

    } catch (error) {
      console.error('Full sync failed:', error)
      return {
        success: false,
        message: `Sync failed: ${error.message}`,
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
    console.log('=== AFFINITY SYNC FUNCTION STARTING ===')
    const syncService = new AffinitySyncService()
    console.log('AffinitySyncService instantiated')
    const result = await syncService.runFullSync()
    console.log('runFullSync completed, result:', result)

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 500,
      }
    )
  } catch (error) {
    console.error('Sync service error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        message: `Service error: ${error.message}`,
        stats: {}
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
