import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EnrichmentRequest {
  entity_id: string
  force_refresh?: boolean
}

interface WebSearchResult {
  title: string
  url: string
  content: string
  published_date?: string
  score: number
}

interface EnrichmentData {
  current_employer?: string
  employment_history?: Array<{
    company: string
    position: string
    start_date?: string
    end_date?: string
    description?: string
  }>
  industry?: string
  expertise_areas?: string[]
  publications?: Array<{
    title: string
    url: string
    published_date?: string
    source?: string
  }>
  speaking_engagements?: Array<{
    title: string
    event: string
    date?: string
    url?: string
  }>
  education?: Array<{
    institution: string
    degree?: string
    field?: string
    graduation_year?: string
  }>
  awards?: Array<{
    title: string
    organization: string
    year?: string
  }>
  social_media?: {
    twitter?: string
    linkedin?: string
    github?: string
  }
  bio?: string
  location?: string
  languages?: string[]
  certifications?: Array<{
    name: string
    issuer: string
    date?: string
  }>
}

async function searchWeb(query: string, maxResults: number = 5): Promise<WebSearchResult[]> {
  const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY')
  if (!perplexityApiKey) {
    throw new Error('PERPLEXITY_API_KEY not found')
  }

  console.log(`🔍 Searching web for: ${query}`)
  
  try {
    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        max_results: maxResults,
        max_tokens_per_page: 1024
      })
    })

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    console.log(`Perplexity API response status: ${response.status}`)
    console.log(`Perplexity response data keys:`, Object.keys(data))
    console.log(`Number of results: ${data.results?.length || 0}`)
    
    // Convert Perplexity search results to our WebSearchResult format
    const results: WebSearchResult[] = (data.results || []).map((result: any) => ({
      title: result.title || 'No title',
      url: result.url || '',
      content: result.snippet || '',
      published_date: result.date || new Date().toISOString(),
      score: 0.9 // Perplexity results are already ranked
    }))
    
    console.log(`Converted ${results.length} search results`)
    return results
    
  } catch (error) {
    console.error('Perplexity search error:', error)
    // Fallback to empty results rather than failing completely
    return []
  }
}

async function extractEnrichmentData(searchResults: WebSearchResult[], personName: string): Promise<EnrichmentData> {
  const enrichmentData: EnrichmentData = {
    expertise_areas: [],
    publications: [],
    speaking_engagements: [],
    employment_history: [],
    education: [],
    awards: [],
    social_media: {},
    certifications: []
  }

  // Extract information from search results
  for (const result of searchResults) {
    const content = result.content
    
    // Use GPT to extract structured data from the Perplexity results
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (openaiApiKey) {
      try {
        const extractionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `Extract structured professional information from the following text about ${personName}. Return a JSON object with the following structure:
                {
                  "current_employer": "string",
                  "employment_history": [{"company": "string", "position": "string", "start_date": "string", "end_date": "string"}],
                  "industry": "string",
                  "expertise_areas": ["string"],
                  "publications": [{"title": "string", "url": "string", "published_date": "string"}],
                  "speaking_engagements": [{"title": "string", "event": "string", "date": "string"}],
                  "education": [{"institution": "string", "degree": "string", "field": "string"}],
                  "awards": [{"title": "string", "organization": "string", "year": "string"}],
                  "social_media": {"linkedin": "string", "twitter": "string"},
                  "bio": "string"
                }
                Only include information that is clearly stated in the text. Use null for missing fields.`
              },
              {
                role: 'user',
                content: content
              }
            ],
            temperature: 0.1,
            max_tokens: 1500
          })
        })

        if (extractionResponse.ok) {
          const extractionData = await extractionResponse.json()
          const extractedText = extractionData.choices[0]?.message?.content || '{}'
          
          try {
            const extracted = JSON.parse(extractedText)
            
            // Merge extracted data
            if (extracted.current_employer) enrichmentData.current_employer = extracted.current_employer
            if (extracted.employment_history) enrichmentData.employment_history = extracted.employment_history
            if (extracted.industry) enrichmentData.industry = extracted.industry
            if (extracted.expertise_areas) enrichmentData.expertise_areas = extracted.expertise_areas
            if (extracted.publications) enrichmentData.publications = extracted.publications
            if (extracted.speaking_engagements) enrichmentData.speaking_engagements = extracted.speaking_engagements
            if (extracted.education) enrichmentData.education = extracted.education
            if (extracted.awards) enrichmentData.awards = extracted.awards
            if (extracted.social_media) enrichmentData.social_media = extracted.social_media
            if (extracted.bio) enrichmentData.bio = extracted.bio
            
          } catch (parseError) {
            console.error('Error parsing extracted data:', parseError)
          }
        }
      } catch (error) {
        console.error('Error extracting structured data:', error)
      }
    }
    
    // Fallback: simple keyword extraction if GPT extraction fails
    if (enrichmentData.expertise_areas?.length === 0) {
      const contentLower = content.toLowerCase()
      const expertiseKeywords = [
        'fintech', 'private credit', 'venture capital', 'private equity',
        'investment banking', 'strategy', 'operations', 'technology',
        'compliance', 'risk management', 'due diligence', 'portfolio management',
        'cryptocurrency', 'blockchain', 'ai', 'machine learning', 'data science'
      ]
      
      for (const keyword of expertiseKeywords) {
        if (contentLower.includes(keyword) && !enrichmentData.expertise_areas?.includes(keyword)) {
          enrichmentData.expertise_areas?.push(keyword)
        }
      }
    }
  }

  return enrichmentData
}

async function generateEnrichmentEmbedding(enrichmentData: EnrichmentData, personName: string): Promise<number[]> {
  // Create a text representation of the enrichment data
  const textParts = [
    personName,
    enrichmentData.current_employer || '',
    enrichmentData.industry || '',
    enrichmentData.bio || '',
    enrichmentData.expertise_areas?.join(', ') || '',
    enrichmentData.employment_history?.map(e => `${e.position} at ${e.company}`).join(', ') || ''
  ].filter(Boolean)

  const text = textParts.join(' ')

  // Generate embedding using OpenAI
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found')
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { entity_id, force_refresh = false }: EnrichmentRequest = await req.json()

    if (!entity_id) {
      return new Response(
        JSON.stringify({ error: 'entity_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get the person entity
    const { data: entity, error: entityError } = await supabase
      .schema('graph')
      .from('entities')
      .select('*')
      .eq('id', entity_id)
      .eq('type', 'person')
      .single()

    if (entityError || !entity) {
      return new Response(
        JSON.stringify({ error: 'Person entity not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already enriched and not forcing refresh
    if (entity.enriched && !force_refresh) {
      return new Response(
        JSON.stringify({ 
          message: 'Entity already enriched',
          enrichment_data: entity.enrichment_data 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🔍 Enriching person: ${entity.name}`)

    // Create search queries
    const searchQueries = [
      `${entity.name} ${entity.metadata?.company || ''}`,
      `${entity.name} ${entity.metadata?.position || ''}`,
      `${entity.name} linkedin profile`,
      `${entity.name} professional background`
    ]

    // Search web for information
    const allSearchResults: WebSearchResult[] = []
    for (const query of searchQueries) {
      try {
        const results = await searchWeb(query, 3)
        allSearchResults.push(...results)
      } catch (error) {
        console.error(`Search error for query "${query}":`, error)
      }
    }

    // Remove duplicates
    const uniqueResults = allSearchResults.filter((result, index, self) => 
      index === self.findIndex(r => r.url === result.url)
    )

    // Extract enrichment data
    const enrichmentData = await extractEnrichmentData(uniqueResults, entity.name)

    // Check if we actually got meaningful data
    const hasRealData = enrichmentData.current_employer || 
                       enrichmentData.industry || 
                       enrichmentData.bio ||
                       (enrichmentData.expertise_areas && enrichmentData.expertise_areas.length > 0) ||
                       (enrichmentData.employment_history && enrichmentData.employment_history.length > 0) ||
                       (enrichmentData.publications && enrichmentData.publications.length > 0)

    if (!hasRealData) {
      console.log(`⚠️ No meaningful enrichment data found for: ${entity.name}`)
      return new Response(
        JSON.stringify({
          success: false,
          entity_id,
          message: 'No meaningful enrichment data found',
          search_results_count: uniqueResults.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate embedding for enriched profile
    const embedding = await generateEnrichmentEmbedding(enrichmentData, entity.name)

    // Update entity with enrichment data
    const { error: updateError } = await supabase
      .schema('graph')
      .from('entities')
      .update({
        enrichment_data: enrichmentData,
        enriched: true,
        last_enriched_at: new Date().toISOString(),
        embedding: embedding
      })
      .eq('id', entity_id)

    if (updateError) {
      throw new Error(`Failed to update entity: ${updateError.message}`)
    }

    console.log(`✅ Successfully enriched: ${entity.name}`)

    return new Response(
      JSON.stringify({
        success: true,
        entity_id,
        enrichment_data: enrichmentData,
        search_results_count: uniqueResults.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Enrichment error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Enrichment failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})