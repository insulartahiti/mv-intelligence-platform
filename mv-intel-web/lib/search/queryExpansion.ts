// Enhanced Knowledge Graph Intelligence - Query Expansion
// Use GPT-4 to expand queries with related terms before searching

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ExpandedQuery {
  originalQuery: string;
  expandedTerms: string[];
  relatedConcepts: string[];
  entityTypes: string[];
  searchStrategy: 'broad' | 'focused' | 'exploratory';
  confidence: number;
}

export interface QueryContext {
  domain?: string;
  entityType?: string;
  searchIntent?: string;
  previousQueries?: string[];
}

/**
 * Expand search query with semantically related terms using GPT-4
 */
export async function expandQuery(
  query: string, 
  context?: QueryContext
): Promise<ExpandedQuery> {
  try {
    const systemPrompt = `You are an expert search query analyzer for a venture capital and startup intelligence platform. 
    
Your task is to expand search queries with semantically related terms that will improve search results.

Context:
- Domain: ${context?.domain || 'venture capital, startups, fintech'}
- Entity Type: ${context?.entityType || 'any'}
- Search Intent: ${context?.searchIntent || 'general search'}

Return a JSON object with:
{
  "expandedTerms": ["term1", "term2", "term3", "term4", "term5"],
  "relatedConcepts": ["concept1", "concept2", "concept3"],
  "entityTypes": ["person", "organization", "deal"],
  "searchStrategy": "broad|focused|exploratory",
  "confidence": 0.0-1.0
}

Guidelines:
- Include industry-specific terms, synonyms, and related concepts
- Consider different ways people might describe the same thing
- Include both formal and informal terminology
- Focus on terms that would appear in company descriptions, LinkedIn profiles, and business documents
- Keep expanded terms concise (1-3 words each)
- Choose search strategy: "broad" for exploratory, "focused" for specific targets, "exploratory" for discovery`;

    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    return {
      originalQuery: query,
      expandedTerms: parsed.expandedTerms || [],
      relatedConcepts: parsed.relatedConcepts || [],
      entityTypes: parsed.entityTypes || [],
      searchStrategy: parsed.searchStrategy || 'broad',
      confidence: parsed.confidence || 0.5
    };

  } catch (error) {
    console.error('Query expansion error:', error);
    
    // Fallback to simple term extraction
    return {
      originalQuery: query,
      expandedTerms: extractSimpleTerms(query),
      relatedConcepts: [],
      entityTypes: ['person', 'organization'],
      searchStrategy: 'broad',
      confidence: 0.3
    };
  }
}

/**
 * Extract simple terms from query as fallback
 */
function extractSimpleTerms(query: string): string[] {
  const stopWords = new Set([
    'who', 'what', 'where', 'when', 'why', 'how', 'can', 'could', 'should', 'would',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
    'do', 'does', 'did', 'doing', 'will', 'would', 'shall', 'should', 'may', 'might',
    'must', 'can', 'could', 'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at',
    'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'among', 'under', 'over'
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter(word => /^[a-zA-Z0-9]+$/.test(word))
    .slice(0, 5); // Limit to 5 terms
}

/**
 * Expand query with domain-specific terms
 */
export async function expandQueryWithDomain(
  query: string,
  domain: 'fintech' | 'healthcare' | 'ai' | 'saas' | 'ecommerce' | 'general'
): Promise<ExpandedQuery> {
  const domainContexts = {
    fintech: {
      domain: 'fintech, financial technology, banking, payments, lending, insurance',
      entityType: 'any',
      searchIntent: 'fintech company and executive search'
    },
    healthcare: {
      domain: 'healthcare, medical technology, biotech, pharmaceuticals, digital health',
      entityType: 'any',
      searchIntent: 'healthcare company and executive search'
    },
    ai: {
      domain: 'artificial intelligence, machine learning, AI, ML, data science, automation',
      entityType: 'any',
      searchIntent: 'AI company and executive search'
    },
    saas: {
      domain: 'software as a service, SaaS, cloud software, B2B software, enterprise software',
      entityType: 'any',
      searchIntent: 'SaaS company and executive search'
    },
    ecommerce: {
      domain: 'ecommerce, online retail, marketplace, consumer goods, D2C',
      entityType: 'any',
      searchIntent: 'ecommerce company and executive search'
    },
    general: {
      domain: 'venture capital, startups, technology, business',
      entityType: 'any',
      searchIntent: 'general business search'
    }
  };

  return expandQuery(query, domainContexts[domain]);
}

/**
 * Expand query for specific entity types
 */
export async function expandQueryForEntityType(
  query: string,
  entityType: 'person' | 'organization' | 'deal' | 'fund'
): Promise<ExpandedQuery> {
  const entityContexts = {
    person: {
      domain: 'executives, founders, investors, professionals',
      entityType: 'person',
      searchIntent: 'person search'
    },
    organization: {
      domain: 'companies, startups, corporations, organizations',
      entityType: 'organization',
      searchIntent: 'company search'
    },
    deal: {
      domain: 'investments, funding rounds, acquisitions, deals',
      entityType: 'deal',
      searchIntent: 'deal search'
    },
    fund: {
      domain: 'venture capital, private equity, investment funds',
      entityType: 'fund',
      searchIntent: 'fund search'
    }
  };

  return expandQuery(query, entityContexts[entityType]);
}

/**
 * Expand query for relationship discovery
 */
export async function expandQueryForRelationships(
  query: string
): Promise<ExpandedQuery> {
  const relationshipContext = {
    domain: 'professional networks, business relationships, connections, partnerships',
    entityType: 'any',
    searchIntent: 'relationship discovery'
  };

  return expandQuery(query, relationshipContext);
}

/**
 * Expand query for competitive analysis
 */
export async function expandQueryForCompetitiveAnalysis(
  query: string
): Promise<ExpandedQuery> {
  const competitiveContext = {
    domain: 'competitors, market analysis, competitive landscape, industry players',
    entityType: 'organization',
    searchIntent: 'competitive analysis'
  };

  return expandQuery(query, competitiveContext);
}

/**
 * Create search query variations for comprehensive results
 */
export function createQueryVariations(expandedQuery: ExpandedQuery): string[] {
  const variations = [expandedQuery.originalQuery];
  
  // Add expanded terms as individual queries
  expandedQuery.expandedTerms.forEach(term => {
    variations.push(term);
  });
  
  // Add combinations of original query with expanded terms
  expandedQuery.expandedTerms.slice(0, 3).forEach(term => {
    variations.push(`${expandedQuery.originalQuery} ${term}`);
  });
  
  // Add related concepts
  expandedQuery.relatedConcepts.forEach(concept => {
    variations.push(concept);
  });
  
  return [...new Set(variations)]; // Remove duplicates
}

/**
 * Score query expansion quality
 */
export function scoreExpansionQuality(expandedQuery: ExpandedQuery): number {
  let score = 0;
  
  // Base score from confidence
  score += expandedQuery.confidence * 0.4;
  
  // Score based on number of expanded terms (optimal range: 3-7)
  const termCount = expandedQuery.expandedTerms.length;
  if (termCount >= 3 && termCount <= 7) {
    score += 0.3;
  } else if (termCount > 0) {
    score += 0.2;
  }
  
  // Score based on related concepts
  if (expandedQuery.relatedConcepts.length > 0) {
    score += 0.2;
  }
  
  // Score based on entity types specificity
  if (expandedQuery.entityTypes.length > 0 && expandedQuery.entityTypes.length < 4) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0);
}
