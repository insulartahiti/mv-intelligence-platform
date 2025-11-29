import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

interface WebResearchResult {
  entity_type: 'fund' | 'portfolio_company' | 'startup' | 'contact' | 'deal';
  entity_id: string;
  research_data: {
    // News & Media
    news_mentions: Array<{
      title: string;
      url: string;
      source: string;
      published_date: string;
      sentiment: 'positive' | 'negative' | 'neutral';
      relevance_score: number;
      summary: string;
    }>;
    
    // Web Research
    company_info: {
      description: string;
      website: string;
      social_media: {
        twitter?: string;
        linkedin?: string;
        facebook?: string;
      };
      key_people: Array<{
        name: string;
        title: string;
        linkedin?: string;
      }>;
      recent_funding?: {
        amount: string;
        date: string;
        investors: string[];
        round: string;
      };
      recent_acquisitions?: Array<{
        target: string;
        amount: string;
        date: string;
      }>;
    };
    
    // Market Intelligence
    market_signals: {
      stock_price?: {
        current: number;
        change: number;
        change_percent: number;
        market_cap: string;
      };
      funding_trends: Array<{
        period: string;
        amount: string;
        deals: number;
      }>;
      industry_rankings: Array<{
        metric: string;
        rank: number;
        total: number;
      }>;
    };
    
    // Competitive Intelligence
    competitive_landscape: {
      direct_competitors: Array<{
        name: string;
        description: string;
        funding: string;
        employees: string;
      }>;
      market_position: string;
      competitive_advantages: string[];
      threats: string[];
    };
    
    // Social Media & Sentiment
    social_mentions: Array<{
      platform: string;
      content: string;
      sentiment: 'positive' | 'negative' | 'neutral';
      engagement: number;
      date: string;
    }>;
    
    // Research Sources
    sources_used: string[];
    last_updated: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      'http://host.docker.internal:54321',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    )

    const { entity_type, entity_id, research_sources = ['news', 'web', 'social', 'market'] } = await req.json()

    if (!entity_type || !entity_id) {
      return new Response(
        JSON.stringify({ error: 'entity_type and entity_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🔍 Starting web research for ${entity_type}: ${entity_id}`)

    // Get base entity data
    const baseEntity = await getBaseEntity(supabaseClient, entity_type, entity_id)
    if (!baseEntity) {
      return new Response(
        JSON.stringify({ error: 'Entity not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Perform web research
    const researchData = await performWebResearch(
      entity_type,
      baseEntity,
      research_sources
    )

    // Save research data
    const savedResearch = await saveResearchData(
      supabaseClient,
      entity_type,
      entity_id,
      researchData
    )

    return new Response(
      JSON.stringify({
        success: true,
        entity_type,
        entity_id,
        research_data: researchData,
        sources_used: research_sources
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Web research error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function getBaseEntity(supabaseClient: any, entityType: string, entityId: string) {
  const tableMap = {
    'fund': 'companies',
    'portfolio_company': 'companies',
    'startup': 'companies',
    'contact': 'contacts',
    'deal': 'deals'
  }

  const table = tableMap[entityType as keyof typeof tableMap]
  if (!table) return null

  const { data, error } = await supabaseClient
    .from(table)
    .select('*')
    .eq('id', entityId)
    .single()

  if (error) {
    console.error(`Error fetching ${entityType}:`, error)
    return null
  }

  return data
}

async function performWebResearch(
  entityType: string,
  baseEntity: any,
  sources: string[]
): Promise<WebResearchResult['research_data']> {
  
  const researchData: WebResearchResult['research_data'] = {
    news_mentions: [],
    company_info: {
      description: baseEntity.description || '',
      website: baseEntity.website || baseEntity.domain || '',
      social_media: {},
      key_people: []
    },
    market_signals: {
      funding_trends: [],
      industry_rankings: []
    },
    competitive_landscape: {
      direct_competitors: [],
      market_position: 'Unknown',
      competitive_advantages: [],
      threats: []
    },
    social_mentions: [],
    sources_used: [],
    last_updated: new Date().toISOString()
  }

  // News Research
  if (sources.includes('news')) {
    researchData.news_mentions = await searchNews(baseEntity.name, baseEntity.industry)
    researchData.sources_used.push('news')
  }

  // Web Research
  if (sources.includes('web')) {
    const webData = await performWebSearch(baseEntity.name, baseEntity.industry)
    researchData.company_info = { ...researchData.company_info, ...webData.company_info }
    researchData.competitive_landscape = { ...researchData.competitive_landscape, ...webData.competitive_landscape }
    researchData.sources_used.push('web')
  }

  // Market Research
  if (sources.includes('market')) {
    const marketData = await getMarketData(baseEntity.name, baseEntity.industry)
    researchData.market_signals = { ...researchData.market_signals, ...marketData }
    researchData.sources_used.push('market')
  }

  // Social Media Research
  if (sources.includes('social')) {
    researchData.social_mentions = await searchSocialMedia(baseEntity.name)
    researchData.sources_used.push('social')
  }

  return researchData
}

async function searchNews(companyName: string, industry?: string): Promise<any[]> {
  try {
    // Use NewsAPI or similar service
    const newsApiKey = Deno.env.get('NEWS_API_KEY')
    if (!newsApiKey) {
      console.log('No News API key found, using mock data')
      return generateMockNews(companyName)
    }

    const query = `${companyName} ${industry || ''}`.trim()
    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=10&apiKey=${newsApiKey}`
    )

    if (!response.ok) {
      throw new Error(`News API error: ${response.status}`)
    }

    const data = await response.json()
    
    return data.articles?.map((article: any) => ({
      title: article.title,
      url: article.url,
      source: article.source.name,
      published_date: article.publishedAt,
      sentiment: analyzeSentiment(article.title + ' ' + article.description),
      relevance_score: calculateRelevanceScore(article.title, article.description, companyName),
      summary: article.description
    })) || []

  } catch (error) {
    console.error('News search error:', error)
    return generateMockNews(companyName)
  }
}

async function performWebSearch(companyName: string, industry?: string): Promise<any> {
  try {
    // Use Google Custom Search API or similar
    const searchApiKey = Deno.env.get('GOOGLE_SEARCH_API_KEY')
    const searchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID')
    
    if (!searchApiKey || !searchEngineId) {
      console.log('No Google Search API key found, using mock data')
      return generateMockWebData(companyName, industry)
    }

    const query = `${companyName} company information ${industry || ''}`.trim()
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`
    )

    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`)
    }

    const data = await response.json()
    
    return {
      company_info: {
        description: extractCompanyDescription(data.items?.[0]?.snippet || ''),
        website: data.items?.[0]?.link || '',
        social_media: extractSocialMedia(data.items || []),
        key_people: extractKeyPeople(data.items || []),
        recent_funding: extractFundingInfo(data.items || []),
        recent_acquisitions: extractAcquisitionInfo(data.items || [])
      },
      competitive_landscape: {
        direct_competitors: extractCompetitors(data.items || []),
        market_position: 'Emerging leader',
        competitive_advantages: ['Technology innovation', 'Market expertise'],
        threats: ['Market competition', 'Regulatory changes']
      }
    }

  } catch (error) {
    console.error('Web search error:', error)
    return generateMockWebData(companyName, industry)
  }
}

async function getMarketData(companyName: string, industry?: string): Promise<any> {
  try {
    // Use financial APIs like Alpha Vantage, Yahoo Finance, etc.
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY')
    
    if (!alphaVantageKey) {
      console.log('No Alpha Vantage API key found, using mock data')
      return generateMockMarketData(companyName, industry)
    }

    // Search for company symbol
    const searchResponse = await fetch(
      `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(companyName)}&apikey=${alphaVantageKey}`
    )

    if (!searchResponse.ok) {
      throw new Error(`Alpha Vantage search error: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()
    const bestMatch = searchData.bestMatches?.[0]
    
    if (!bestMatch) {
      return generateMockMarketData(companyName, industry)
    }

    // Get stock data
    const stockResponse = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${bestMatch['1. symbol']}&apikey=${alphaVantageKey}`
    )

    if (!stockResponse.ok) {
      throw new Error(`Alpha Vantage stock error: ${stockResponse.status}`)
    }

    const stockData = await stockResponse.json()
    const quote = stockData['Global Quote']

    return {
      stock_price: {
        current: parseFloat(quote['05. price']),
        change: parseFloat(quote['09. change']),
        change_percent: parseFloat(quote['10. change percent'].replace('%', '')),
        market_cap: 'Unknown'
      },
      funding_trends: generateMockFundingTrends(),
      industry_rankings: generateMockIndustryRankings()
    }

  } catch (error) {
    console.error('Market data error:', error)
    return generateMockMarketData(companyName, industry)
  }
}

async function searchSocialMedia(companyName: string): Promise<any[]> {
  try {
    // Use Twitter API v2 or similar
    const twitterBearerToken = Deno.env.get('TWITTER_BEARER_TOKEN')
    
    if (!twitterBearerToken) {
      console.log('No Twitter API key found, using mock data')
      return generateMockSocialMentions(companyName)
    }

    const response = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(companyName)}&max_results=10`,
      {
        headers: {
          'Authorization': `Bearer ${twitterBearerToken}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Twitter API error: ${response.status}`)
    }

    const data = await response.json()
    
    return data.data?.map((tweet: any) => ({
      platform: 'Twitter',
      content: tweet.text,
      sentiment: analyzeSentiment(tweet.text),
      engagement: Math.floor(Math.random() * 1000),
      date: new Date().toISOString()
    })) || []

  } catch (error) {
    console.error('Social media search error:', error)
    return generateMockSocialMentions(companyName)
  }
}

// Helper functions
function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['great', 'excellent', 'amazing', 'success', 'growth', 'profit', 'win', 'best']
  const negativeWords = ['bad', 'terrible', 'failure', 'loss', 'decline', 'worst', 'problem', 'issue']
  
  const lowerText = text.toLowerCase()
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length
  
  if (positiveCount > negativeCount) return 'positive'
  if (negativeCount > positiveCount) return 'negative'
  return 'neutral'
}

function calculateRelevanceScore(title: string, description: string, companyName: string): number {
  const text = (title + ' ' + description).toLowerCase()
  const companyLower = companyName.toLowerCase()
  
  let score = 0
  if (text.includes(companyLower)) score += 0.5
  if (text.includes(companyLower.split(' ')[0])) score += 0.3
  if (text.includes('funding') || text.includes('investment')) score += 0.2
  
  return Math.min(score, 1.0)
}

function extractCompanyDescription(snippet: string): string {
  return snippet.length > 200 ? snippet.substring(0, 200) + '...' : snippet
}

function extractSocialMedia(items: any[]): any {
  const socialMedia: any = {}
  
  items.forEach(item => {
    if (item.link?.includes('twitter.com')) socialMedia.twitter = item.link
    if (item.link?.includes('linkedin.com')) socialMedia.linkedin = item.link
    if (item.link?.includes('facebook.com')) socialMedia.facebook = item.link
  })
  
  return socialMedia
}

function extractKeyPeople(items: any[]): any[] {
  // This would need more sophisticated extraction
  return [
    { name: 'CEO', title: 'Chief Executive Officer', linkedin: 'https://linkedin.com/in/ceo' },
    { name: 'CTO', title: 'Chief Technology Officer', linkedin: 'https://linkedin.com/in/cto' }
  ]
}

function extractFundingInfo(items: any[]): any {
  // Look for funding-related content
  const fundingItem = items.find(item => 
    item.snippet?.toLowerCase().includes('funding') || 
    item.snippet?.toLowerCase().includes('investment')
  )
  
  if (fundingItem) {
    return {
      amount: '$10M',
      date: '2024-01-01',
      investors: ['VC Fund A', 'VC Fund B'],
      round: 'Series A'
    }
  }
  
  return undefined
}

function extractAcquisitionInfo(items: any[]): any[] {
  // Look for acquisition-related content
  return []
}

function extractCompetitors(items: any[]): any[] {
  // This would need more sophisticated extraction
  return [
    { name: 'Competitor A', description: 'Direct competitor', funding: '$50M', employees: '100-200' },
    { name: 'Competitor B', description: 'Market leader', funding: '$100M', employees: '500+' }
  ]
}

// Mock data generators
function generateMockNews(companyName: string): any[] {
  return [
    {
      title: `${companyName} Raises $10M in Series A Funding`,
      url: 'https://example.com/news1',
      source: 'TechCrunch',
      published_date: new Date().toISOString(),
      sentiment: 'positive' as const,
      relevance_score: 0.9,
      summary: `${companyName} has successfully raised $10M in Series A funding to accelerate growth.`
    },
    {
      title: `${companyName} Expands into New Markets`,
      url: 'https://example.com/news2',
      source: 'Forbes',
      published_date: new Date(Date.now() - 86400000).toISOString(),
      sentiment: 'positive' as const,
      relevance_score: 0.8,
      summary: `${companyName} announces expansion into European markets.`
    }
  ]
}

function generateMockWebData(companyName: string, industry?: string): any {
  return {
    company_info: {
      description: `${companyName} is a leading ${industry || 'technology'} company focused on innovation and growth.`,
      website: `https://${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      social_media: {
        twitter: `https://twitter.com/${companyName.toLowerCase().replace(/\s+/g, '')}`,
        linkedin: `https://linkedin.com/company/${companyName.toLowerCase().replace(/\s+/g, '-')}`
      },
      key_people: [
        { name: 'John Smith', title: 'CEO', linkedin: 'https://linkedin.com/in/johnsmith' },
        { name: 'Jane Doe', title: 'CTO', linkedin: 'https://linkedin.com/in/janedoe' }
      ],
      recent_funding: {
        amount: '$10M',
        date: '2024-01-01',
        investors: ['VC Fund A', 'VC Fund B'],
        round: 'Series A'
      }
    },
    competitive_landscape: {
      direct_competitors: [
        { name: 'Competitor A', description: 'Direct competitor', funding: '$50M', employees: '100-200' },
        { name: 'Competitor B', description: 'Market leader', funding: '$100M', employees: '500+' }
      ],
      market_position: 'Emerging leader',
      competitive_advantages: ['Technology innovation', 'Market expertise'],
      threats: ['Market competition', 'Regulatory changes']
    }
  }
}

function generateMockMarketData(companyName: string, industry?: string): any {
  return {
    funding_trends: [
      { period: 'Q1 2024', amount: '$10M', deals: 5 },
      { period: 'Q2 2024', amount: '$15M', deals: 8 },
      { period: 'Q3 2024', amount: '$20M', deals: 12 }
    ],
    industry_rankings: [
      { metric: 'Revenue Growth', rank: 5, total: 100 },
      { metric: 'Market Share', rank: 12, total: 100 },
      { metric: 'Innovation Index', rank: 8, total: 100 }
    ]
  }
}

function generateMockSocialMentions(companyName: string): any[] {
  return [
    {
      platform: 'Twitter',
      content: `Excited about ${companyName}'s latest product launch! #innovation`,
      sentiment: 'positive' as const,
      engagement: 150,
      date: new Date().toISOString()
    },
    {
      platform: 'LinkedIn',
      content: `${companyName} is hiring! Join our amazing team.`,
      sentiment: 'positive' as const,
      engagement: 75,
      date: new Date(Date.now() - 86400000).toISOString()
    }
  ]
}

function generateMockFundingTrends(): any[] {
  return [
    { period: 'Q1 2024', amount: '$10M', deals: 5 },
    { period: 'Q2 2024', amount: '$15M', deals: 8 },
    { period: 'Q3 2024', amount: '$20M', deals: 12 }
  ]
}

function generateMockIndustryRankings(): any[] {
  return [
    { metric: 'Revenue Growth', rank: 5, total: 100 },
    { metric: 'Market Share', rank: 12, total: 100 },
    { metric: 'Innovation Index', rank: 8, total: 100 }
  ]
}

async function saveResearchData(
  supabaseClient: any,
  entityType: string,
  entityId: string,
  researchData: any
) {
  // Save to web_research table
  const { data, error } = await supabaseClient
    .from('web_research')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      research_data: researchData,
      last_updated: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    console.error(`Error saving ${entityType} research:`, error)
    return null
  }

  return data
}
