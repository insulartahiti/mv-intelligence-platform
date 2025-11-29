// Enhanced Knowledge Graph Intelligence - Intent Classification
// Replace regex patterns with semantic classification using GPT-4

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const QUERY_INTENTS = {
  ENTITY_SEARCH: 'Find specific entities',
  RELATIONSHIP_DISCOVERY: 'Find connections/relationships', 
  INTRO_PATH: 'Find introduction paths',
  COMPETITIVE_ANALYSIS: 'Compare or analyze competitors',
  MARKET_INTELLIGENCE: 'Market trends and insights',
  DUE_DILIGENCE: 'Research for investment decisions',
  SIMILARITY_SEARCH: 'Find similar entities',
  FUNDING_ANALYSIS: 'Analyze funding and investment data',
  NETWORK_ANALYSIS: 'Analyze network structure and influence',
  TREND_ANALYSIS: 'Identify trends and patterns',
  MULTI_HOP: 'Multi-hop relationship traversal'
} as const;

export type QueryIntentType = keyof typeof QUERY_INTENTS;

export interface QueryIntent {
  type: QueryIntentType;
  confidence: number;
  extractedEntities: string[];
  extractedCompanies: string[];
  extractedPeople: string[];
  searchStrategy: 'broad' | 'focused' | 'exploratory';
  filters: {
    entityTypes?: string[];
    industries?: string[];
    locations?: string[];
    timeRange?: string;
    relationshipTypes?: string[];
  };
  context: string;
}

/**
 * Classify query intent using GPT-4
 */
export async function classifyIntent(query: string): Promise<QueryIntent> {
  try {
    const systemPrompt = `You are an expert query classifier for a venture capital and startup intelligence platform.

Analyze the user's search query and classify it into one of these intents:

${Object.entries(QUERY_INTENTS).map(([key, desc]) => `- ${key}: ${desc}`).join('\n')}

Return a JSON object with:
{
  "type": "INTENT_TYPE",
  "confidence": 0.0-1.0,
  "extractedEntities": ["entity1", "entity2"],
  "extractedCompanies": ["company1", "company2"],
  "extractedPeople": ["person1", "person2"],
  "searchStrategy": "broad|focused|exploratory",
  "filters": {
    "entityTypes": ["person", "organization", "deal"],
    "industries": ["fintech", "healthcare"],
    "locations": ["San Francisco", "New York"],
    "timeRange": "last_year|last_6_months|all_time",
    "relationshipTypes": ["works_at", "invests_in", "advises"]
  },
  "context": "Brief explanation of what the user is looking for"
}

Guidelines:
- Look for keywords that indicate intent (e.g., "who can connect me" = INTRO_PATH)
- Extract proper nouns as entities, companies, or people
- Identify implicit filters from the query
- Determine if the search should be broad (exploratory) or focused (specific target)
- Consider the business context of venture capital and startup intelligence`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 800
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    return {
      type: parsed.type || 'ENTITY_SEARCH',
      confidence: parsed.confidence || 0.5,
      extractedEntities: parsed.extractedEntities || [],
      extractedCompanies: parsed.extractedCompanies || [],
      extractedPeople: parsed.extractedPeople || [],
      searchStrategy: parsed.searchStrategy || 'broad',
      filters: parsed.filters || {},
      context: parsed.context || query
    };

  } catch (error) {
    console.error('Intent classification error:', error);
    
    // Fallback to pattern-based classification
    return fallbackIntentClassification(query);
  }
}

/**
 * Fallback pattern-based intent classification
 */
function fallbackIntentClassification(query: string): QueryIntent {
  const lowerQuery = query.toLowerCase();
  
  // Check for intro path patterns
  if (lowerQuery.includes('who can connect') || 
      lowerQuery.includes('introduction to') || 
      lowerQuery.includes('connect me with') ||
      lowerQuery.includes('introduce me to') ||
      lowerQuery.includes('who knows')) {
    return {
      type: 'INTRO_PATH',
      confidence: 0.8,
      extractedEntities: extractEntities(query),
      extractedCompanies: [],
      extractedPeople: [],
      searchStrategy: 'focused',
      filters: { entityTypes: ['person'] },
      context: 'Looking for introduction paths'
    };
  }
  
  // Check for competitive analysis patterns
  if (lowerQuery.includes('competitor') || 
      lowerQuery.includes('competing') || 
      lowerQuery.includes('vs ') ||
      lowerQuery.includes('compare')) {
    return {
      type: 'COMPETITIVE_ANALYSIS',
      confidence: 0.7,
      extractedEntities: extractEntities(query),
      extractedCompanies: extractCompanies(query),
      extractedPeople: [],
      searchStrategy: 'focused',
      filters: { entityTypes: ['organization'] },
      context: 'Competitive analysis request'
    };
  }
  
  // Check for relationship discovery patterns
  if (lowerQuery.includes('who works at') || 
      lowerQuery.includes('employees of') || 
      lowerQuery.includes('team at') ||
      lowerQuery.includes('people at')) {
    return {
      type: 'RELATIONSHIP_DISCOVERY',
      confidence: 0.7,
      extractedEntities: extractEntities(query),
      extractedCompanies: extractCompanies(query),
      extractedPeople: [],
      searchStrategy: 'focused',
      filters: { entityTypes: ['person'] },
      context: 'Looking for people at specific companies'
    };
  }
  
  // Check for similarity search patterns
  if (lowerQuery.includes('similar to') || 
      lowerQuery.includes('like ') || 
      lowerQuery.includes('comparable to') ||
      lowerQuery.includes('same as')) {
    return {
      type: 'SIMILARITY_SEARCH',
      confidence: 0.7,
      extractedEntities: extractEntities(query),
      extractedCompanies: extractCompanies(query),
      extractedPeople: [],
      searchStrategy: 'broad',
      filters: {},
      context: 'Looking for similar entities'
    };
  }
  
  // Check for funding analysis patterns
  if (lowerQuery.includes('funding') || 
      lowerQuery.includes('investment') || 
      lowerQuery.includes('raised') ||
      lowerQuery.includes('series a') ||
      lowerQuery.includes('series b')) {
    return {
      type: 'FUNDING_ANALYSIS',
      confidence: 0.6,
      extractedEntities: extractEntities(query),
      extractedCompanies: extractCompanies(query),
      extractedPeople: [],
      searchStrategy: 'focused',
      filters: { entityTypes: ['organization', 'deal'] },
      context: 'Funding and investment analysis'
    };
  }
  
  // Default to entity search
  return {
    type: 'ENTITY_SEARCH',
    confidence: 0.5,
    extractedEntities: extractEntities(query),
    extractedCompanies: extractCompanies(query),
    extractedPeople: extractPeople(query),
    searchStrategy: 'broad',
    filters: {},
    context: 'General entity search'
  };
}

/**
 * Extract entities from query using simple pattern matching
 */
function extractEntities(query: string): string[] {
  // Look for capitalized words (potential proper nouns)
  const capitalizedWords = query.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  
  // Filter out common words
  const commonWords = new Set(['The', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For', 'Of', 'With', 'By']);
  
  return capitalizedWords
    .filter(word => !commonWords.has(word))
    .slice(0, 5); // Limit to 5 entities
}

/**
 * Extract company names from query
 */
function extractCompanies(query: string): string[] {
  const companyPatterns = [
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|Corp|LLC|Ltd|Company|Technologies|Systems|Solutions|Group|Partners|Capital|Ventures|Fund)\b/g,
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:AI|ML|Tech|Fintech|Health|Bio|SaaS|Cloud|Data|Digital|Mobile|Web|Online)\b/g
  ];
  
  const companies: string[] = [];
  companyPatterns.forEach(pattern => {
    const matches = query.match(pattern) || [];
    companies.push(...matches);
  });
  
  return companies.slice(0, 3); // Limit to 3 companies
}

/**
 * Extract people names from query
 */
function extractPeople(query: string): string[] {
  // Look for patterns like "John Doe" or "Dr. Smith"
  const namePattern = /\b(?:Dr\.|Mr\.|Ms\.|Mrs\.)?\s*[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
  const matches = query.match(namePattern) || [];
  
  return matches.slice(0, 3); // Limit to 3 people
}

/**
 * Route query to appropriate search function based on intent
 */
export async function routeQuery(
  query: string,
  searchFunctions: {
    entitySearch: (query: string, filters?: any) => Promise<any[]>;
    introPathSearch: (entities: string[]) => Promise<any[]>;
    competitiveAnalysis: (companies: string[]) => Promise<any[]>;
    similaritySearch: (targetEntity: string) => Promise<any[]>;
    relationshipDiscovery: (query: string, filters?: any) => Promise<any[]>;
    fundingAnalysis: (query: string, filters?: any) => Promise<any[]>;
  }
): Promise<any[]> {
  const intent = await classifyIntent(query);
  
  console.log('Query intent:', intent);
  
  switch (intent.type) {
    case 'INTRO_PATH':
      return searchFunctions.introPathSearch(intent.extractedEntities);
      
    case 'SIMILARITY_SEARCH':
      const targetEntity = intent.extractedEntities[0] || intent.extractedCompanies[0];
      if (targetEntity) {
        return searchFunctions.similaritySearch(targetEntity);
      }
      return searchFunctions.entitySearch(query, intent.filters);
      
    case 'COMPETITIVE_ANALYSIS':
      if (intent.extractedCompanies.length > 0) {
        return searchFunctions.competitiveAnalysis(intent.extractedCompanies);
      }
      return searchFunctions.entitySearch(query, intent.filters);
      
    case 'RELATIONSHIP_DISCOVERY':
      return searchFunctions.relationshipDiscovery(query, intent.filters);
      
    case 'FUNDING_ANALYSIS':
      return searchFunctions.fundingAnalysis(query, intent.filters);
      
    case 'ENTITY_SEARCH':
    case 'MARKET_INTELLIGENCE':
    case 'DUE_DILIGENCE':
    case 'NETWORK_ANALYSIS':
    case 'TREND_ANALYSIS':
    default:
      return searchFunctions.entitySearch(query, intent.filters);
  }
}

/**
 * Validate intent classification quality
 */
export function validateIntentQuality(intent: QueryIntent): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Check confidence level
  if (intent.confidence < 0.3) {
    issues.push('Low confidence in intent classification');
    suggestions.push('Consider providing more context or rephrasing the query');
  }
  
  // Check if entities were extracted
  if (intent.extractedEntities.length === 0 && intent.type !== 'MARKET_INTELLIGENCE') {
    issues.push('No entities extracted from query');
    suggestions.push('Query might be too vague - try including specific names or companies');
  }
  
  // Check for appropriate filters
  if (intent.type === 'INTRO_PATH' && !intent.filters.entityTypes?.includes('person')) {
    issues.push('Intro path search should focus on people');
    suggestions.push('Consider adding person filter to search results');
  }
  
  // Check search strategy appropriateness
  if (intent.type === 'INTRO_PATH' && intent.searchStrategy !== 'focused') {
    issues.push('Intro path search should be focused, not broad');
    suggestions.push('Narrow down the search to specific target entities');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    suggestions
  };
}
