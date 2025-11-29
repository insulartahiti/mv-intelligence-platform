const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

class EnhancedEmbeddingGenerator {
  constructor() {
    this.batchSize = 10
    this.delayMs = 200
  }

  // Enhanced text generation with rich semantic context
  async buildRichEntityText(entity) {
    let text = `Company: ${entity.name}\n`
    text += `Type: ${entity.type}\n`
    
    // Basic information
    if (entity.domain) text += `Domain: ${entity.domain}\n`
    if (entity.industry) text += `Industry: ${entity.industry}\n`
    if (entity.description) text += `Description: ${entity.description}\n`
    if (entity.brief_description) text += `Brief Description: ${entity.brief_description}\n`
    
    // Generate AI-powered business description
    const businessContext = await this.generateBusinessContext(entity)
    if (businessContext) {
      text += `Business Focus: ${businessContext}\n`
    }
    
    // Technology and use cases
    const techContext = await this.generateTechnologyContext(entity)
    if (techContext) {
      text += `Technology & Use Cases: ${techContext}\n`
    }
    
    // Industry-specific terminology
    const industryTerms = this.generateIndustryTerms(entity)
    if (industryTerms) {
      text += `Industry Focus: ${industryTerms}\n`
    }
    
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
    
    // Enhanced enrichment data
    if (entity.enrichment_data && typeof entity.enrichment_data === 'object') {
      const enrichment = entity.enrichment_data
      if (enrichment.current_employer) text += `Current Employer: ${enrichment.current_employer}\n`
      if (enrichment.title) text += `Title: ${enrichment.title}\n`
      if (enrichment.bio) text += `Bio: ${enrichment.bio}\n`
      if (enrichment.website) text += `Website: ${enrichment.website}\n`
      if (enrichment.linkedin) text += `LinkedIn: ${enrichment.linkedin}\n`
    }
    
    // Employment history
    if (entity.employment_history && Array.isArray(entity.employment_history)) {
      text += `Employment History: ${entity.employment_history.map((job) => 
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

  // Generate AI-powered business context
  async generateBusinessContext(entity) {
    try {
      const prompt = `Based on the company information below, generate a concise business description that includes:
1. What the company does
2. Key products/services
3. Target market
4. Business model
5. Industry focus areas

Company: ${entity.name}
Type: ${entity.type}
Industry: ${entity.industry || 'Unknown'}
Description: ${entity.description || 'No description available'}

Respond in 2-3 sentences focusing on business value and market positioning.`

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.7
      })

      return response.choices[0].message.content.trim()
    } catch (error) {
      console.error('Error generating business context:', error)
      return null
    }
  }

  // Generate technology and use case context
  async generateTechnologyContext(entity) {
    try {
      const prompt = `Based on the company information, identify and describe:
1. Key technologies used
2. Primary use cases
3. Technical capabilities
4. Integration possibilities

Company: ${entity.name}
Industry: ${entity.industry || 'Unknown'}
Description: ${entity.description || 'No description available'}

Focus on technical aspects and practical applications.`

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.7
      })

      return response.choices[0].message.content.trim()
    } catch (error) {
      console.error('Error generating technology context:', error)
      return null
    }
  }

  // Generate industry-specific terminology
  generateIndustryTerms(entity) {
    const industry = entity.industry?.toLowerCase() || ''
    const name = entity.name?.toLowerCase() || ''
    const description = entity.description?.toLowerCase() || ''
    
    const terms = []
    
    // Fintech/Compliance terms
    if (industry.includes('fintech') || industry.includes('financial') || 
        name.includes('kyb') || name.includes('kyc') || name.includes('aml') ||
        description.includes('compliance') || description.includes('regulatory')) {
      terms.push('Know Your Business', 'Know Your Customer', 'Anti-Money Laundering', 
                'compliance', 'regulatory technology', 'regtech', 'fintech', 
                'financial services', 'banking', 'payments', 'risk management')
    }
    
    // AI/ML terms
    if (industry.includes('artificial intelligence') || industry.includes('machine learning') ||
        name.includes('ai') || description.includes('artificial intelligence')) {
      terms.push('artificial intelligence', 'machine learning', 'AI', 'ML', 'data science',
                'predictive analytics', 'automation', 'intelligent systems')
    }
    
    // SaaS/Software terms
    if (industry.includes('software') || industry.includes('saas') || 
        industry.includes('enterprise software')) {
      terms.push('software as a service', 'SaaS', 'enterprise software', 'cloud computing',
                'API', 'integration', 'platform', 'workflow automation')
    }
    
    // Add more industry-specific terms as needed
    return terms.length > 0 ? terms.join(', ') : null
  }

  // Generate embedding using OpenAI
  async generateEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text
      })
      return response.data[0].embedding
    } catch (error) {
      console.error('Error generating embedding:', error)
      throw error
    }
  }

  // Process a batch of entities
  async processBatch(entities) {
    console.log(`Processing batch of ${entities.length} entities`)
    
    const embeddings = []
    
    for (const entity of entities) {
      try {
        const richText = await this.buildRichEntityText(entity)
        const embedding = await this.generateEmbedding(richText)
        
        embeddings.push({
          id: entity.id,
          embedding: embedding,
          richText: richText
        })
        
        console.log(`Generated enhanced embedding for: ${entity.name}`)
        
        // Delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, this.delayMs))
        
      } catch (error) {
        console.error(`Error processing entity ${entity.name}:`, error)
      }
    }
    
    // Update database with embeddings
    for (const { id, embedding } of embeddings) {
      try {
        const { error } = await supabase
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
    
    console.log(`Successfully processed ${embeddings.length} enhanced embeddings`)
    return embeddings
  }

  // Generate AI summaries for entities
  async generateAISummaries(entities) {
    console.log(`Generating AI summaries for ${entities.length} entities`)
    
    for (const entity of entities) {
      try {
        const prompt = `Create a comprehensive AI summary for this company:

Company: ${entity.name}
Type: ${entity.type}
Industry: ${entity.industry || 'Unknown'}
Description: ${entity.description || 'No description available'}

Include:
1. Business overview and value proposition
2. Key technologies and capabilities
3. Target market and use cases
4. Competitive advantages
5. Market positioning

Format as a structured summary with clear sections.`

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0.7
        })

        const aiSummary = response.choices[0].message.content.trim()

        // Update entity with AI summary
        const { error } = await supabase
          .schema('graph')
          .from('entities')
          .update({ 
            ai_summary: aiSummary,
            enriched: true,
            last_enriched_at: new Date().toISOString()
          })
          .eq('id', entity.id)

        if (error) {
          console.error(`Error updating AI summary for ${entity.name}:`, error)
        } else {
          console.log(`Generated AI summary for: ${entity.name}`)
        }

        // Delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, this.delayMs))
        
      } catch (error) {
        console.error(`Error generating AI summary for ${entity.name}:`, error)
      }
    }
  }

  // Main execution function
  async generateAllEnhancedEmbeddings() {
    try {
      console.log('Starting enhanced embedding generation...')
      
      // Get all entities
      const { data: entities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .not('name', 'is', null)
        .limit(100) // Start with 100 entities for testing
      
      if (error) {
        throw error
      }
      
      console.log(`Found ${entities.length} entities to process`)
      
      // Process in batches
      for (let i = 0; i < entities.length; i += this.batchSize) {
        const batch = entities.slice(i, i + this.batchSize)
        await this.processBatch(batch)
        
        // Delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // Generate AI summaries
      await this.generateAISummaries(entities)
      
      console.log('Enhanced embedding generation completed!')
      
    } catch (error) {
      console.error('Error in enhanced embedding generation:', error)
    }
  }
}

// Run the enhanced embedding generator
async function main() {
  const generator = new EnhancedEmbeddingGenerator()
  await generator.generateAllEnhancedEmbeddings()
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = EnhancedEmbeddingGenerator
