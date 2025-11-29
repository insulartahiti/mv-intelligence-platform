import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AffinityWebhookEvent {
  id: string
  type: string
  data: {
    id: number
    name?: string
    domain?: string
    industry?: string
    pipeline_stage?: string
    fund?: string
    taxonomy?: string
    valuation_amount?: number
    investment_amount?: number
    year_founded?: number
    employee_count?: number
    location_city?: string
    location_country?: string
    urgency?: string
    series?: string
    founder_gender?: string
    pass_lost_reason?: string
    sourced_by?: string
    notion_page?: string
    related_deals?: string[]
    apollo_taxonomy?: string
    brief_description?: string
    first_name?: string
    last_name?: string
    emails?: string[]
    phone_numbers?: string[]
    organization_ids?: number[]
    title?: string
    linkedin_url?: string
    created_at: string
    updated_at: string
  }
  created_at: string
}

interface WebhookProcessingResult {
  processed: boolean
  entity_type: string
  entity_id: string
  action: 'created' | 'updated' | 'deleted'
  changes?: string[]
}

class AffinityWebhookHandler {
  private supabase: any
  private affinityApiKey: string

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    this.affinityApiKey = Deno.env.get('AFFINITY_API_KEY') ?? ''
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

    return await response.json()
  }

  private async processOrganizationWebhook(event: AffinityWebhookEvent): Promise<WebhookProcessingResult> {
    try {
      const org = event.data
      const orgEntityId = await this.generateEntityId(org.name || '', 'organization', org.domain)
      
      // Check if organization already exists
      const { data: existingEntity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', orgEntityId)
        .single()

      const action = existingEntity ? 'updated' : 'created'
      
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
        source: 'affinity_webhook',
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

      console.log(`Webhook: ${action} organization: ${org.name}`)
      
      return {
        processed: true,
        entity_type: 'organization',
        entity_id: orgEntityId,
        action
      }
    } catch (error) {
      console.error(`Error processing organization webhook:`, error)
      return {
        processed: false,
        entity_type: 'organization',
        entity_id: '',
        action: 'updated'
      }
    }
  }

  private async processPersonWebhook(event: AffinityWebhookEvent): Promise<WebhookProcessingResult> {
    try {
      const person = event.data
      const fullName = `${person.first_name || ''} ${person.last_name || ''}`.trim()
      const personEntityId = await this.generateEntityId(fullName, 'person')
      
      // Check if person already exists
      const { data: existingEntity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', personEntityId)
        .single()

      const action = existingEntity ? 'updated' : 'created'
      
      // Create/update person entity
      const personEntity = {
        id: personEntityId,
        name: fullName,
        type: 'person',
        email: person.emails?.[0] || null,
        title: person.title,
        linkedin_url: person.linkedin_url,
        affinity_person_id: person.id,
        source: 'affinity_webhook',
        last_synced_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_internal: false
      }

      await this.supabase
        .schema('graph')
        .from('entities')
        .upsert(personEntity, { onConflict: 'id' })

      console.log(`Webhook: ${action} person: ${fullName}`)
      
      return {
        processed: true,
        entity_type: 'person',
        entity_id: personEntityId,
        action
      }
    } catch (error) {
      console.error(`Error processing person webhook:`, error)
      return {
        processed: false,
        entity_type: 'person',
        entity_id: '',
        action: 'updated'
      }
    }
  }

  private async processOpportunityWebhook(event: AffinityWebhookEvent): Promise<WebhookProcessingResult> {
    try {
      const opportunity = event.data
      const opportunityEntityId = await this.generateEntityId(opportunity.name || '', 'deal')
      
      // Check if opportunity already exists
      const { data: existingEntity } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('id', opportunityEntityId)
        .single()

      const action = existingEntity ? 'updated' : 'created'
      
      // Create/update opportunity entity
      const opportunityEntity = {
        id: opportunityEntityId,
        name: opportunity.name,
        type: 'deal',
        pipeline_stage: opportunity.pipeline_stage,
        fund: opportunity.fund,
        taxonomy: opportunity.taxonomy,
        valuation_amount: opportunity.valuation_amount,
        investment_amount: opportunity.investment_amount,
        urgency: opportunity.urgency,
        series: opportunity.series,
        sourced_by: opportunity.sourced_by,
        notion_page: opportunity.notion_page,
        related_deals: opportunity.related_deals || [],
        apollo_taxonomy: opportunity.apollo_taxonomy,
        brief_description: opportunity.brief_description,
        affinity_org_id: opportunity.id,
        source: 'affinity_webhook',
        last_synced_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_internal: false,
        is_portfolio: opportunity.fund ? true : false,
        is_pipeline: opportunity.pipeline_stage ? true : false
      }

      await this.supabase
        .schema('graph')
        .from('entities')
        .upsert(opportunityEntity, { onConflict: 'id' })

      console.log(`Webhook: ${action} opportunity: ${opportunity.name}`)
      
      return {
        processed: true,
        entity_type: 'deal',
        entity_id: opportunityEntityId,
        action
      }
    } catch (error) {
      console.error(`Error processing opportunity webhook:`, error)
      return {
        processed: false,
        entity_type: 'deal',
        entity_id: '',
        action: 'updated'
      }
    }
  }

  async processWebhookEvent(event: AffinityWebhookEvent): Promise<WebhookProcessingResult> {
    try {
      console.log(`Processing webhook event: ${event.type} for ID: ${event.data.id}`)
      
      switch (event.type) {
        case 'organization.created':
        case 'organization.updated':
          return await this.processOrganizationWebhook(event)
          
        case 'person.created':
        case 'person.updated':
          return await this.processPersonWebhook(event)
          
        case 'opportunity.created':
        case 'opportunity.updated':
          return await this.processOpportunityWebhook(event)
          
        case 'organization.deleted':
        case 'person.deleted':
        case 'opportunity.deleted':
          // Handle deletions - mark as inactive or remove
          console.log(`Deletion event received: ${event.type} for ID: ${event.data.id}`)
          return {
            processed: true,
            entity_type: event.type.split('.')[0],
            entity_id: event.data.id.toString(),
            action: 'deleted'
          }
          
        default:
          console.log(`Unhandled webhook event type: ${event.type}`)
          return {
            processed: false,
            entity_type: 'unknown',
            entity_id: '',
            action: 'updated'
          }
      }
    } catch (error) {
      console.error('Error processing webhook event:', error)
      return {
        processed: false,
        entity_type: 'unknown',
        entity_id: '',
        action: 'updated'
      }
    }
  }

  async validateWebhookSignature(payload: string, signature: string): Promise<boolean> {
    // In a real implementation, you would validate the webhook signature
    // using Affinity's webhook secret to ensure the request is authentic
    const webhookSecret = Deno.env.get('AFFINITY_WEBHOOK_SECRET')
    
    if (!webhookSecret) {
      console.warn('No webhook secret configured, skipping signature validation')
      return true
    }

    // Implement HMAC signature validation here
    // For now, we'll trust the webhook (in production, implement proper validation)
    return true
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const webhookSecret = req.headers.get('x-affinity-signature')
    const payload = await req.text()
    
    const webhookHandler = new AffinityWebhookHandler()
    
    // Validate webhook signature
    const isValid = await webhookHandler.validateWebhookSignature(payload, webhookSecret || '')
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse webhook event
    const event: AffinityWebhookEvent = JSON.parse(payload)
    
    // Process the webhook event
    const result = await webhookHandler.processWebhookEvent(event)
    
    // Log webhook processing
    await webhookHandler.supabase
      .schema('graph')
      .from('webhook_logs')
      .insert({
        webhook_id: event.id,
        event_type: event.type,
        entity_id: event.data.id.toString(),
        processed: result.processed,
        result: result,
        created_at: new Date().toISOString()
      })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook processed successfully',
        result
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Webhook handler error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
