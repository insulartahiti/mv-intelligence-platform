import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

class InteractionProcessor {
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

  private async fetchOrganizationInteractions(orgId: number): Promise<AffinityInteraction[]> {
    try {
      const endTime = new Date()
      const startTime = new Date('2020-01-01') // Full historical data from 2020
      
      // Affinity API only allows 1-year date ranges, so we need to chunk the requests
      const interactionTypes = [0, 1, 2, 3] // email, meeting, call, note (0-3, not 1-4)
      const allInteractions: AffinityInteraction[] = []
      
      // Create 1-year chunks from 2020 to present
      const chunks = this.createDateChunks(startTime, endTime)
      
      for (const type of interactionTypes) {
        for (const chunk of chunks) {
          try {
            console.log(`Fetching ${this.getInteractionTypeName(type)} interactions for org ${orgId} from ${chunk.start.toISOString()} to ${chunk.end.toISOString()}`)
            
            const response = await this.makeAffinityRequest(
              `/interactions?organization_id=${orgId}&type=${type}&start_time=${chunk.start.toISOString()}&end_time=${chunk.end.toISOString()}&limit=1000`
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
              console.log(`Found ${interactions.length} ${this.getInteractionTypeName(type)} interactions for this chunk`)
            }
          } catch (error) {
            console.log(`No interactions of type ${type} for org ${orgId} in chunk ${chunk.start.toISOString()}`)
          }
        }
      }
      
      console.log(`Total interactions fetched for org ${orgId}: ${allInteractions.length}`)
      return allInteractions
    } catch (error) {
      console.error(`Error fetching interactions for org ${orgId}:`, error)
      return []
    }
  }

  private createDateChunks(startTime: Date, endTime: Date): Array<{start: Date, end: Date}> {
    const chunks = []
    let currentStart = new Date(startTime)
    
    while (currentStart < endTime) {
      const currentEnd = new Date(currentStart)
      currentEnd.setFullYear(currentEnd.getFullYear() + 1)
      
      // Don't go beyond the end time
      if (currentEnd > endTime) {
        currentEnd.setTime(endTime.getTime())
      }
      
      chunks.push({
        start: new Date(currentStart),
        end: new Date(currentEnd)
      })
      
      currentStart = new Date(currentEnd)
    }
    
    return chunks
  }

  private getInteractionTypeName(type: number): string {
    const typeMap: { [key: number]: string } = {
      0: 'email',
      1: 'meeting',
      2: 'call',
      3: 'note'
    }
    return typeMap[type] || 'unknown'
  }

  private async storeInteraction(interaction: AffinityInteraction, entityId: string): Promise<void> {
    try {
      const interactionData = {
        affinity_interaction_id: interaction.id,
        interaction_type: interaction.type,
        subject: interaction.subject,
        content_preview: interaction.content?.substring(0, 500) || '',
        content_full: interaction.content || '',
        participants: interaction.person_id ? [`person_${interaction.person_id}`] : [],
        company_id: entityId,
        started_at: interaction.date,
        source: 'affinity_api_sync'
      }

      await this.supabase
        .schema('graph')
        .from('interactions')
        .upsert(interactionData, { onConflict: 'affinity_interaction_id' })
    } catch (error) {
      console.error(`Error storing interaction ${interaction.id}:`, error)
    }
  }

  async processInteractionsForEntity(entityId: string, affinityOrgId: number): Promise<{ success: boolean; interactionsProcessed: number }> {
    try {
      console.log(`Processing interactions for entity ${entityId}, Affinity org ${affinityOrgId}`)
      
      const interactions = await this.fetchOrganizationInteractions(affinityOrgId)
      
      if (interactions.length === 0) {
        console.log(`No interactions found for organization ${affinityOrgId}`)
        return { success: true, interactionsProcessed: 0 }
      }

      // Store interactions in database
      for (const interaction of interactions) {
        await this.storeInteraction(interaction, entityId)
      }

      console.log(`Processed ${interactions.length} interactions for organization ${affinityOrgId}`)
      return { success: true, interactionsProcessed: interactions.length }
    } catch (error) {
      console.error(`Error processing interactions for organization ${affinityOrgId}:`, error)
      return { success: false, interactionsProcessed: 0 }
    }
  }

  async processAllInteractions(): Promise<{ success: boolean; totalProcessed: number; errors: string[] }> {
    try {
      console.log('Starting bulk interaction processing...')
      
      // Get all entities with Affinity org IDs
      const { data: entities } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('id, name, affinity_org_id')
        .not('affinity_org_id', 'is', null)
        .limit(50) // Process in batches

      if (!entities || entities.length === 0) {
        return { success: true, totalProcessed: 0, errors: [] }
      }

      let totalProcessed = 0
      const errors: string[] = []

      for (const entity of entities) {
        try {
          const result = await this.processInteractionsForEntity(entity.id, entity.affinity_org_id)
          if (result.success) {
            totalProcessed += result.interactionsProcessed
          } else {
            errors.push(`Failed to process interactions for ${entity.name}`)
          }
        } catch (error) {
          errors.push(`Error processing ${entity.name}: ${error.message}`)
        }
      }

      console.log(`Bulk interaction processing completed. Processed ${totalProcessed} interactions.`)
      return { success: true, totalProcessed, errors }
    } catch (error) {
      console.error('Error in bulk interaction processing:', error)
      return { success: false, totalProcessed: 0, errors: [error.message] }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action = 'bulk', entityId, affinityOrgId } = await req.json()
    
    const processor = new InteractionProcessor()
    
    let result
    if (action === 'entity' && entityId && affinityOrgId) {
      result = await processor.processInteractionsForEntity(entityId, affinityOrgId)
    } else {
      result = await processor.processAllInteractions()
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 500,
      }
    )
  } catch (error) {
    console.error('Interaction processing error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
