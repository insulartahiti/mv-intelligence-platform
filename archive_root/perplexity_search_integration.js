require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_SEARCH_URL = 'https://api.perplexity.ai/search';

class PerplexitySearchIntegration {
  constructor() {
    this.cache = new Map();
    this.stats = {
      searches: 0,
      cacheHits: 0,
      errors: 0
    };
  }

  // Perplexity Search API integration
  async searchWeb(query, options = {}) {
    const {
      maxResults = 5,
      maxTokensPerPage = 1024,
      country = null,
      searchDomainFilter = null
    } = options;

    // Check cache first
    const cacheKey = `${query}_${maxResults}_${country || 'global'}`;
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      console.log(`📋 Using cached search result for: ${query}`);
      return this.cache.get(cacheKey);
    }

    try {
      console.log(`🔍 Searching: ${query}`);
      
      const requestBody = {
        query: query,
        max_results: maxResults,
        max_tokens_per_page: maxTokensPerPage
      };

      // Add optional parameters
      if (country) requestBody.country = country;
      if (searchDomainFilter) requestBody.search_domain_filter = searchDomainFilter;

      const response = await fetch(PERPLEXITY_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity Search API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Cache the result
      this.cache.set(cacheKey, data);
      this.stats.searches++;
      
      console.log(`✅ Found ${data.results?.length || 0} results for: ${query}`);
      return data;

    } catch (error) {
      console.error(`❌ Search error for "${query}":`, error.message);
      this.stats.errors++;
      return { results: [], error: error.message };
    }
  }

  // Multi-query search for comprehensive research
  async searchMultipleQueries(queries, options = {}) {
    console.log(`🔍 Multi-query search: ${queries.length} queries`);
    
    const results = {};
    
    for (const [index, query] of queries.entries()) {
      try {
        const searchResult = await this.searchWeb(query, options);
        results[`query_${index + 1}`] = {
          query: query,
          results: searchResult.results || [],
          error: searchResult.error || null
        };
        
        // Rate limiting between queries
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error searching "${query}":`, error);
        results[`query_${index + 1}`] = {
          query: query,
          results: [],
          error: error.message
        };
      }
    }
    
    return results;
  }

  // Generate targeted search queries using GPT-4o
  async generateSearchQueries(entity, researchType) {
    const prompt = `Generate 3-5 specific web search queries to find information about this entity for ${researchType} research.

Entity: ${entity.name}
Type: ${entity.type}
Industry: ${entity.industry || 'Not specified'}
Research Type: ${researchType}

Generate queries that would find:
- Recent news and developments
- Company information and business model
- Market position and competitors
- Industry trends and analysis
- Regulatory compliance information

Respond with JSON array of search strings:
["query 1", "query 2", "query 3"]`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a research analyst. Generate specific, targeted web search queries for entity research.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 300
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.queries || [result]; // Handle both array and object responses
      
    } catch (error) {
      console.error('Error generating search queries:', error);
      return [`${entity.name} ${researchType}`, `${entity.name} company information`];
    }
  }

  // Synthesize search results with GPT-4o
  async synthesizeSearchResults(entity, searchResults, researchType) {
    const prompt = `Synthesize these web search results into a comprehensive analysis for ${entity.name}.

Entity: ${entity.name}
Type: ${entity.type}
Industry: ${entity.industry || 'Not specified'}
Research Type: ${researchType}

Search Results:
${JSON.stringify(searchResults, null, 2)}

Create a structured analysis with:
1. Key findings and insights
2. Recent developments and news
3. Market position and competitive landscape
4. Business model and capabilities
5. Regulatory compliance status
6. Strategic opportunities and risks

Respond with JSON:
{
  "key_findings": "Main insights from search results",
  "recent_developments": "Latest news and updates",
  "market_position": "Competitive analysis",
  "business_model": "How the company operates",
  "compliance_status": "Regulatory compliance info",
  "strategic_insights": "Opportunities and recommendations",
  "confidence_score": 0.85,
  "sources": ["list of key sources used"]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a fintech intelligence analyst. Synthesize web search results into comprehensive entity analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 1500
      });

      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      console.error('Error synthesizing search results:', error);
      return {
        key_findings: "Search results could not be processed",
        recent_developments: "No recent information available",
        market_position: "Analysis unavailable",
        business_model: "Information not found",
        compliance_status: "Unknown",
        strategic_insights: "Further research needed",
        confidence_score: 0.1,
        sources: []
      };
    }
  }

  // Enhanced entity research using Perplexity Search
  async researchEntity(entity, researchTypes = ['company_info', 'market_intelligence', 'recent_news']) {
    console.log(`\n🔍 Researching entity: ${entity.name}`);
    
    const researchResults = {};
    
    for (const researchType of researchTypes) {
      try {
        console.log(`\n📊 Research type: ${researchType}`);
        
        // Generate targeted search queries
        const queries = await this.generateSearchQueries(entity, researchType);
        console.log(`Generated ${queries.length} search queries`);
        
        // Perform multi-query search
        const searchResults = await this.searchMultipleQueries(queries, {
          maxResults: 5,
          maxTokensPerPage: 1024
        });
        
        // Synthesize results
        const synthesis = await this.synthesizeSearchResults(entity, searchResults, researchType);
        
        researchResults[researchType] = {
          queries: queries,
          searchResults: searchResults,
          synthesis: synthesis,
          timestamp: new Date().toISOString()
        };
        
        console.log(`✅ Completed ${researchType} research`);
        
        // Rate limiting between research types
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Error in ${researchType} research:`, error);
        researchResults[researchType] = {
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    return researchResults;
  }

  // Get statistics
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate: this.stats.cacheHits / (this.stats.searches + this.stats.cacheHits) || 0
    };
  }
}

// Test the integration
async function testPerplexitySearch() {
  console.log('🧪 Testing Perplexity Search Integration...\n');
  
  const searchIntegration = new PerplexitySearchIntegration();
  
  // Test basic search
  console.log('1. Testing basic search...');
  const basicSearch = await searchIntegration.searchWeb('Dwolla fintech company Ben Milne', {
    maxResults: 3
  });
  console.log('Basic search results:', basicSearch.results?.length || 0, 'results');
  
  // Test multi-query search
  console.log('\n2. Testing multi-query search...');
  const multiSearch = await searchIntegration.searchMultipleQueries([
    'Dwolla company information',
    'Ben Milne founder Dwolla',
    'Dwolla fintech payments'
  ], { maxResults: 2 });
  console.log('Multi-query results:', Object.keys(multiSearch).length, 'queries processed');
  
  // Test entity research
  console.log('\n3. Testing entity research...');
  const testEntity = {
    name: 'Ben Milne',
    type: 'person',
    industry: 'fintech'
  };
  
  const researchResults = await searchIntegration.researchEntity(testEntity, ['company_info']);
  console.log('Entity research completed:', Object.keys(researchResults).length, 'research types');
  
  // Show statistics
  console.log('\n📊 Statistics:');
  console.log(searchIntegration.getStats());
  
  console.log('\n✅ Perplexity Search Integration test completed!');
}

// Run test if called directly
if (require.main === module) {
  testPerplexitySearch().catch(console.error);
}

module.exports = PerplexitySearchIntegration;
