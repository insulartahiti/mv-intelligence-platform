import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EntityForEmbedding {
  id: string
  name: string
  type: string
  domain?: string
  industry?: string
  description?: string
  brief_description?: string
  pipeline_stage?: string
  fund?: string
  taxonomy?: string
  location_city?: string
  location_country?: string
  year_founded?: number
  employee_count?: number
  valuation_amount?: number
  investment_amount?: number
  series?: string
  urgency?: string
  sourced_by?: string
  apollo_taxonomy?: string
  is_portfolio?: boolean
  is_pipeline?: boolean
  is_internal?: boolean
  importance?: number
  enrichment_data?: any
  employment_history?: any
  areas_of_expertise?: string[]
  skills?: string[]
  ai_summary?: string
  ai_insights?: any
}

class EmbeddingGenerator {
  public supabase: any
  private openaiApiKey: string
  private batchSize: number = 100 // Increased batch size for faster processing
  private delayBetweenBatches: number = 1000 // Reduced delay to 1 second

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    this.openaiApiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.substring(0, 8000) // Limit to avoid token limits
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      return result.data[0]?.embedding || []
    } catch (error) {
      console.error('Error generating embedding:', error)
      throw error
    }
  }

  buildEntityText(entity: EntityForEmbedding): string {
    let text = `Name: ${entity.name}\n`
    text += `Type: ${entity.type}\n`
    
    if (entity.domain) text += `Domain: ${entity.domain}\n`
    if (entity.industry) text += `Industry: ${entity.industry}\n`
    if (entity.description) text += `Description: ${entity.description}\n`
    if (entity.brief_description) text += `Brief Description: ${entity.brief_description}\n`
    
    // Pipeline and deal information
    if (entity.pipeline_stage) text += `Pipeline Stage: ${entity.pipeline_stage}\n`
    if (entity.fund) text += `Fund: ${entity.fund}\n`
    if (entity.taxonomy) text += `Taxonomy: ${entity.taxonomy}\n`
    if (entity.apollo_taxonomy) text += `Apollo Taxonomy: ${entity.apollo_taxonomy}\n`
    
    // Location
    if (entity.location_city) text += `Location: ${entity.location_city}`
    if (entity.location_country) text += `, ${entity.location_country}\n`
    
    // Company details
    if (entity.year_founded) text += `Founded: ${entity.year_founded}\n`
    if (entity.employee_count) text += `Employees: ${entity.employee_count}\n`
    if (entity.valuation_amount) text += `Valuation: $${entity.valuation_amount}\n`
    if (entity.investment_amount) text += `Investment: $${entity.investment_amount}\n`
    if (entity.series) text += `Series: ${entity.series}\n`
    if (entity.urgency) text += `Urgency: ${entity.urgency}\n`
    if (entity.sourced_by) text += `Sourced By: ${entity.sourced_by}\n`
    
    // Status flags
    if (entity.is_portfolio) text += `Portfolio Company: Yes\n`
    if (entity.is_pipeline) text += `Pipeline Company: Yes\n`
    if (entity.is_internal) text += `Internal Entity: Yes\n`
    
    // Enrichment data
    if (entity.enrichment_data && typeof entity.enrichment_data === 'object') {
      const enrichment = entity.enrichment_data
      if (enrichment.current_employer) text += `Current Employer: ${enrichment.current_employer}\n`
      if (enrichment.title) text += `Title: ${enrichment.title}\n`
      if (enrichment.bio) text += `Bio: ${enrichment.bio}\n`
    }
    
    // Employment history
    if (entity.employment_history && Array.isArray(entity.employment_history)) {
      text += `Employment History: ${entity.employment_history.map((job: any) => 
        `${job.title} at ${job.company} (${job.start_date} - ${job.end_date || 'Present'})`
      ).join(', ')}\n`
    }
    
    // Areas of expertise and skills
    if (entity.areas_of_expertise && entity.areas_of_expertise.length > 0) {
      text += `Areas of Expertise: ${entity.areas_of_expertise.join(', ')}\n`
    }
    if (entity.skills && entity.skills.length > 0) {
      text += `Skills: ${entity.skills.join(', ')}\n`
    }
    
    // AI-generated content
    if (entity.ai_summary) text += `AI Summary: ${entity.ai_summary}\n`
    if (entity.ai_insights && typeof entity.ai_insights === 'object') {
      const insights = entity.ai_insights
      if (insights.key_insights) text += `Key Insights: ${insights.key_insights}\n`
      if (insights.opportunities) text += `Opportunities: ${insights.opportunities}\n`
    }
    
    return text.trim()
  }

  async processBatch(entities: EntityForEmbedding[]): Promise<void> {
    console.log(`Processing batch of ${entities.length} entities`)
    
    const embeddings: { id: string; embedding: number[] }[] = []
    
    for (const entity of entities) {
      try {
        const text = this.buildEntityText(entity)
        const embedding = await this.generateEmbedding(text)
        
        embeddings.push({
          id: entity.id,
          embedding: embedding
        })
        
        console.log(`Generated embedding for: ${entity.name}`)
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        console.error(`Error processing entity ${entity.name}:`, error)
        // Continue with other entities
      }
    }
    
    // Update database with embeddings
    for (const { id, embedding } of embeddings) {
      try {
        const { error } = await this.supabase
          .schema('graph')
          .from('entities')
          .update({ embedding: embedding })
          .eq('id', id)
        
        if (error) {
          console.error(`Error updating embedding for ${id}:`, error)
        }
      } catch (error) {
        console.error(`Database error for ${id}:`, error)
      }
    }
    
    console.log(`Successfully processed ${embeddings.length} embeddings`)
  }

  async generateAllEmbeddings(): Promise<void> {
    try {
      console.log('Starting embedding generation for all entities')
      
      let offset = 0
      let totalProcessed = 0
      
      while (true) {
        // Fetch batch of entities without embeddings
        const { data: entities, error } = await this.supabase
          .schema('graph')
          .from('entities')
          .select(`
            id, name, type, domain, industry, description, brief_description,
            pipeline_stage, fund, taxonomy, apollo_taxonomy,
            location_city, location_country, year_founded, employee_count,
            valuation_amount, investment_amount, series, urgency, sourced_by,
            is_portfolio, is_pipeline, is_internal, importance,
            enrichment_data, employment_history, areas_of_expertise, skills,
            ai_summary, ai_insights
          `)
          .is('embedding', null) // Only entities without embeddings
          .range(offset, offset + this.batchSize - 1)
        
        if (error) {
          console.error('Error fetching entities:', error)
          break
        }
        
        if (!entities || entities.length === 0) {
          console.log('No more entities to process')
          break
        }
        
        console.log(`Fetched ${entities.length} entities (offset: ${offset})`)
        
        // Process batch
        await this.processBatch(entities)
        
        totalProcessed += entities.length
        offset += this.batchSize
        
        console.log(`Total processed: ${totalProcessed}/${6989}`)
        
        // Delay between batches to respect rate limits
        if (entities.length === this.batchSize) {
          console.log(`Waiting ${this.delayBetweenBatches}ms before next batch...`)
          await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches))
        }
      }
      
      console.log(`Embedding generation complete! Processed ${totalProcessed} entities`)
      
    } catch (error) {
      console.error('Error in generateAllEmbeddings:', error)
      throw error
    }
  }

  async getProgress(): Promise<{ total: number; withEmbeddings: number; withoutEmbeddings: number }> {
    try {
      // Get total count
      const { count: total } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
      
      // Get count with embeddings
      const { count: withEmbeddings } = await this.supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null)
      
      return {
        total: total || 0,
        withEmbeddings: withEmbeddings || 0,
        withoutEmbeddings: (total || 0) - (withEmbeddings || 0)
      }
    } catch (error) {
      console.error('Error getting progress:', error)
      return { total: 0, withEmbeddings: 0, withoutEmbeddings: 0 }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const generator = new EmbeddingGenerator()
    
    if (req.method === 'POST') {
      const { action } = await req.json()
      
      if (action === 'generate') {
        // Process a larger batch for faster completion
        const batchSize = 50 // Increased batch size for faster processing
        let offset = 0
        
        // Get current progress to determine offset
        const progress = await generator.getProgress()
        offset = progress.withEmbeddings
        
        // Fetch batch of entities without embeddings
        const { data: entities, error } = await generator.supabase
          .schema('graph')
          .from('entities')
          .select(`
            id, name, type, domain, industry, description, brief_description,
            pipeline_stage, fund, taxonomy, apollo_taxonomy,
            location_city, location_country, year_founded, employee_count,
            valuation_amount, investment_amount, series, urgency, sourced_by,
            is_portfolio, is_pipeline, is_internal, importance,
            enrichment_data, employment_history, areas_of_expertise, skills,
            ai_summary, ai_insights
          `)
          .is('embedding', null)
          .range(offset, offset + batchSize - 1)
        
        if (error) {
          throw new Error(`Database error: ${error.message}`)
        }
        
        if (!entities || entities.length === 0) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'No more entities to process',
              progress: await generator.getProgress()
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          )
        }
        
        // Process the batch
        await generator.processBatch(entities)
        
        // Get updated progress
        const updatedProgress = await generator.getProgress()
        
        return new Response(
          JSON.stringify({
            success: true,
            message: `Processed ${entities.length} entities`,
            progress: updatedProgress,
            processed: entities.map(e => e.name)
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } else if (action === 'progress') {
        // Get progress
        const progress = await generator.getProgress()
        
        return new Response(
          JSON.stringify({
            success: true,
            progress: progress
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      } else {
        throw new Error('Invalid action. Use "generate" or "progress"')
      }
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Only POST method is supported'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405,
        }
      )
    }
  } catch (error) {
    console.error('Embedding generator error:', error)
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})