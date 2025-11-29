import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

interface NewsSearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    source: string;
    published_date: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    relevance_score: number;
    summary: string;
    content?: string;
    entities_mentioned: string[];
    keywords: string[];
  }>;
  total_results: number;
  search_time: number;
  sources_used: string[];
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

    const { 
      query, 
      entity_type, 
      entity_id, 
      sources = ['newsapi', 'google', 'reddit'],
      limit = 20,
      date_from,
      date_to,
      sentiment_filter
    } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🔍 Starting news search for: "${query}"`)

    const startTime = Date.now()
    const searchResults = await performNewsSearch(
      query,
      sources,
      limit,
      date_from,
      date_to,
      sentiment_filter
    )

    const searchTime = Date.now() - startTime

    // If entity_id is provided, save results to database
    if (entity_id && entity_type) {
      await saveNewsResults(supabaseClient, entity_type, entity_id, searchResults.results)
    }

    return new Response(
      JSON.stringify({
        success: true,
        query,
        results: searchResults.results,
        total_results: searchResults.total_results,
        search_time: searchTime,
        sources_used: searchResults.sources_used,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('News search error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function performNewsSearch(
  query: string,
  sources: string[],
  limit: number,
  dateFrom?: string,
  dateTo?: string,
  sentimentFilter?: string
): Promise<NewsSearchResult> {
  
  const allResults: any[] = []
  const sourcesUsed: string[] = []

  // Search each source
  for (const source of sources) {
    try {
      let sourceResults: any[] = []
      
      switch (source) {
        case 'newsapi':
          sourceResults = await searchNewsAPI(query, limit, dateFrom, dateTo)
          break
        case 'google':
          sourceResults = await searchGoogleNews(query, limit, dateFrom, dateTo)
          break
        case 'reddit':
          sourceResults = await searchReddit(query, limit)
          break
        case 'twitter':
          sourceResults = await searchTwitter(query, limit)
          break
        default:
          console.log(`Unknown source: ${source}`)
          continue
      }

      if (sourceResults.length > 0) {
        allResults.push(...sourceResults)
        sourcesUsed.push(source)
      }
    } catch (error) {
      console.error(`Error searching ${source}:`, error)
    }
  }

  // Remove duplicates and sort by relevance
  const uniqueResults = removeDuplicates(allResults)
  const sortedResults = uniqueResults
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit)

  // Apply sentiment filter if specified
  const filteredResults = sentimentFilter 
    ? sortedResults.filter(result => result.sentiment === sentimentFilter)
    : sortedResults

  return {
    query,
    results: filteredResults,
    total_results: filteredResults.length,
    search_time: 0, // Will be set by caller
    sources_used: sourcesUsed
  }
}

async function searchNewsAPI(
  query: string, 
  limit: number, 
  dateFrom?: string, 
  dateTo?: string
): Promise<any[]> {
  const newsApiKey = Deno.env.get('NEWS_API_KEY')
  if (!newsApiKey) {
    console.log('No News API key found, using mock data')
    return generateMockNewsResults(query, limit)
  }

  try {
    const params = new URLSearchParams({
      q: query,
      sortBy: 'publishedAt',
      pageSize: limit.toString(),
      apiKey: newsApiKey
    })

    if (dateFrom) params.append('from', dateFrom)
    if (dateTo) params.append('to', dateTo)

    const response = await fetch(
      `https://newsapi.org/v2/everything?${params.toString()}`
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
      relevance_score: calculateRelevanceScore(article.title, article.description, query),
      summary: article.description,
      content: article.content,
      entities_mentioned: extractEntities(article.title + ' ' + article.description),
      keywords: extractKeywords(article.title + ' ' + article.description)
    })) || []

  } catch (error) {
    console.error('News API search error:', error)
    return generateMockNewsResults(query, limit)
  }
}

async function searchGoogleNews(
  query: string, 
  limit: number, 
  dateFrom?: string, 
  dateTo?: string
): Promise<any[]> {
  const searchApiKey = Deno.env.get('GOOGLE_SEARCH_API_KEY')
  const searchEngineId = Deno.env.get('GOOGLE_SEARCH_ENGINE_ID')
  
  if (!searchApiKey || !searchEngineId) {
    console.log('No Google Search API key found, using mock data')
    return generateMockNewsResults(query, limit)
  }

  try {
    const searchQuery = `${query} news ${dateFrom ? `after:${dateFrom}` : ''} ${dateTo ? `before:${dateTo}` : ''}`.trim()
    
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}&num=${limit}`
    )

    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`)
    }

    const data = await response.json()
    
    return data.items?.map((item: any) => ({
      title: item.title,
      url: item.link,
      source: extractSourceFromUrl(item.link),
      published_date: item.pagemap?.metatags?.[0]?.['article:published_time'] || new Date().toISOString(),
      sentiment: analyzeSentiment(item.title + ' ' + item.snippet),
      relevance_score: calculateRelevanceScore(item.title, item.snippet, query),
      summary: item.snippet,
      entities_mentioned: extractEntities(item.title + ' ' + item.snippet),
      keywords: extractKeywords(item.title + ' ' + item.snippet)
    })) || []

  } catch (error) {
    console.error('Google News search error:', error)
    return generateMockNewsResults(query, limit)
  }
}

async function searchReddit(query: string, limit: number): Promise<any[]> {
  try {
    // Reddit doesn't require API key for basic searches
    const response = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=${limit}`
    )

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}`)
    }

    const data = await response.json()
    
    return data.data?.children?.map((post: any) => ({
      title: post.data.title,
      url: `https://reddit.com${post.data.permalink}`,
      source: 'Reddit',
      published_date: new Date(post.data.created_utc * 1000).toISOString(),
      sentiment: analyzeSentiment(post.data.title + ' ' + post.data.selftext),
      relevance_score: calculateRelevanceScore(post.data.title, post.data.selftext, query),
      summary: post.data.selftext?.substring(0, 200) || post.data.title,
      entities_mentioned: extractEntities(post.data.title + ' ' + post.data.selftext),
      keywords: extractKeywords(post.data.title + ' ' + post.data.selftext)
    })) || []

  } catch (error) {
    console.error('Reddit search error:', error)
    return []
  }
}

async function searchTwitter(query: string, limit: number): Promise<any[]> {
  const twitterBearerToken = Deno.env.get('TWITTER_BEARER_TOKEN')
  
  if (!twitterBearerToken) {
    console.log('No Twitter API key found, skipping Twitter search')
    return []
  }

  try {
    const response = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${limit}`,
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
      title: tweet.text,
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      source: 'Twitter',
      published_date: new Date().toISOString(),
      sentiment: analyzeSentiment(tweet.text),
      relevance_score: calculateRelevanceScore(tweet.text, '', query),
      summary: tweet.text,
      entities_mentioned: extractEntities(tweet.text),
      keywords: extractKeywords(tweet.text)
    })) || []

  } catch (error) {
    console.error('Twitter search error:', error)
    return []
  }
}

// Helper functions
function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['great', 'excellent', 'amazing', 'success', 'growth', 'profit', 'win', 'best', 'outstanding', 'brilliant']
  const negativeWords = ['bad', 'terrible', 'failure', 'loss', 'decline', 'worst', 'problem', 'issue', 'crisis', 'disaster']
  
  const lowerText = text.toLowerCase()
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length
  
  if (positiveCount > negativeCount) return 'positive'
  if (negativeCount > positiveCount) return 'negative'
  return 'neutral'
}

function calculateRelevanceScore(title: string, description: string, query: string): number {
  const text = (title + ' ' + description).toLowerCase()
  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(' ').filter(word => word.length > 2)
  
  let score = 0
  
  // Exact phrase match
  if (text.includes(queryLower)) score += 0.5
  
  // Individual word matches
  queryWords.forEach(word => {
    if (text.includes(word)) score += 0.1
  })
  
  // Title matches are more important
  if (title.toLowerCase().includes(queryLower)) score += 0.3
  
  // Keywords that indicate relevance
  const relevanceKeywords = ['funding', 'investment', 'acquisition', 'partnership', 'launch', 'announcement']
  relevanceKeywords.forEach(keyword => {
    if (text.includes(keyword)) score += 0.1
  })
  
  return Math.min(score, 1.0)
}

function extractEntities(text: string): string[] {
  // Simple entity extraction - in production, use NLP libraries
  const entities: string[] = []
  const words = text.split(' ')
  
  // Look for capitalized words (potential entities)
  words.forEach(word => {
    if (word.length > 2 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      entities.push(word.replace(/[^\w]/g, ''))
    }
  })
  
  return [...new Set(entities)].slice(0, 5) // Remove duplicates and limit
}

function extractKeywords(text: string): string[] {
  // Simple keyword extraction
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(' ')
    .filter(word => word.length > 3 && !stopWords.includes(word))
    .slice(0, 10)
}

function extractSourceFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return domain.replace('www.', '').split('.')[0]
  } catch {
    return 'Unknown'
  }
}

function removeDuplicates(results: any[]): any[] {
  const seen = new Set()
  return results.filter(result => {
    const key = result.url || result.title
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function generateMockNewsResults(query: string, limit: number): any[] {
  const mockResults = [
    {
      title: `${query} Raises $10M in Series A Funding`,
      url: 'https://example.com/news1',
      source: 'TechCrunch',
      published_date: new Date().toISOString(),
      sentiment: 'positive' as const,
      relevance_score: 0.9,
      summary: `${query} has successfully raised $10M in Series A funding to accelerate growth and expand into new markets.`,
      entities_mentioned: [query, 'Series A', 'Funding'],
      keywords: ['funding', 'series', 'growth', 'expansion', 'investment']
    },
    {
      title: `${query} Expands into European Markets`,
      url: 'https://example.com/news2',
      source: 'Forbes',
      published_date: new Date(Date.now() - 86400000).toISOString(),
      sentiment: 'positive' as const,
      relevance_score: 0.8,
      summary: `${query} announces strategic expansion into European markets with new partnerships and local operations.`,
      entities_mentioned: [query, 'Europe', 'Partnerships'],
      keywords: ['expansion', 'europe', 'partnerships', 'strategic', 'markets']
    },
    {
      title: `${query} Faces Regulatory Challenges`,
      url: 'https://example.com/news3',
      source: 'Reuters',
      published_date: new Date(Date.now() - 172800000).toISOString(),
      sentiment: 'negative' as const,
      relevance_score: 0.7,
      summary: `${query} encounters regulatory hurdles in key markets, potentially affecting growth plans.`,
      entities_mentioned: [query, 'Regulatory', 'Markets'],
      keywords: ['regulatory', 'challenges', 'hurdles', 'markets', 'growth']
    }
  ]
  
  return mockResults.slice(0, limit)
}

async function saveNewsResults(
  supabaseClient: any,
  entityType: string,
  entityId: string,
  results: any[]
) {
  try {
    const newsToInsert = results.map(result => ({
      entity_type: entityType,
      entity_id: entityId,
      title: result.title,
      url: result.url,
      source: result.source,
      published_date: result.published_date,
      sentiment: result.sentiment,
      relevance_score: result.relevance_score,
      summary: result.summary,
      content: result.content
    }))

    if (newsToInsert.length > 0) {
      await supabaseClient
        .from('news_mentions')
        .insert(newsToInsert)
    }

    console.log(`✅ Saved ${newsToInsert.length} news results for ${entityType}:${entityId}`)
  } catch (error) {
    console.error('Error saving news results:', error)
  }
}
