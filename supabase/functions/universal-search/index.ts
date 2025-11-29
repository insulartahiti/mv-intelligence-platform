import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// ============================================================================
// INVESTMENT INTELLIGENCE TYPES
// ============================================================================

interface InvestmentQuery {
  intent: 'due_diligence' | 'funding_analysis' | 'market_research' | 'relationship_mapping' | 'competitive_analysis' | 'warm_introductions' | 'general_search';
  entity_types: string[];
  search_terms: string[];
  filters: {
    industry?: string[];
    stage?: string[];
    location?: string[];
    funding_range?: { min: number; max: number };
    employee_range?: { min: number; max: number };
    relationship_strength?: number;
  };
  context: string;
  max_results: number;
}

interface SearchResult {
  type: 'company' | 'contact' | 'interaction' | 'opportunity' | 'warm_introduction' | 'market_insight';
  id: string;
  title: string;
  description: string;
  relevance_score: number;
  investment_insights: {
    due_diligence_notes: string[];
    funding_intelligence: string;
    market_position: string;
    competitive_landscape: string[];
    relationship_opportunities: string[];
    risk_factors: string[];
    next_steps: string[];
  };
  metadata: any;
}

// ============================================================================
// NATURAL LANGUAGE PROCESSING
// ============================================================================

async function processNaturalLanguageQuery(query: string): Promise<InvestmentQuery> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Analyze this investment-related query and extract structured information:

Query: "${query}"

Return JSON with:
{
  "intent": "due_diligence" | "funding_analysis" | "market_research" | "relationship_mapping" | "competitive_analysis" | "warm_introductions" | "general_search",
  "entity_types": ["company", "contact", "interaction", "opportunity"],
  "search_terms": ["extracted", "key", "terms"],
  "filters": {
    "industry": ["fintech", "healthcare", "AI"],
    "stage": ["seed", "series-a", "growth"],
    "location": ["SF", "NYC", "London"],
    "funding_range": {"min": 1000000, "max": 10000000},
    "employee_range": {"min": 10, "max": 100},
    "relationship_strength": 0.7
  },
  "context": "Brief context of what the user is looking for",
  "max_results": 20
}

Focus on investment intelligence: due diligence, funding rounds, market analysis, competitive positioning, relationship mapping, warm introductions.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert investment analyst. Parse queries to extract investment intelligence requirements and search parameters. You MUST respond with valid JSON only, no other text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Clean and parse JSON response
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return JSON.parse(cleanContent);
  } catch (error) {
    console.error('Error processing natural language query:', error);
    // Fallback to basic parsing
    return {
      intent: 'general_search',
      entity_types: ['company', 'contact'],
      search_terms: query.toLowerCase().split(' ').filter(term => term.length > 2),
      filters: {},
      context: query,
      max_results: 20
    };
  }
}

// ============================================================================
// ENHANCED EMBEDDING GENERATION
// ============================================================================

async function generateInvestmentEmbedding(entity: any, entityType: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  let content = '';
  
  switch (entityType) {
    case 'company':
      content = `Company: ${entity.name}
Domain: ${entity.domain || 'N/A'}
Industry: ${entity.industry || 'N/A'}
Description: ${entity.description || 'N/A'}
Employees: ${entity.employees || 'N/A'}
Funding Stage: ${entity.funding_stage || 'N/A'}
Revenue Range: ${entity.revenue_range || 'N/A'}
Location: ${entity.location || 'N/A'}
Company Type: ${entity.company_type || 'N/A'}
Tags: ${entity.tags?.join(', ') || 'N/A'}

Investment Context:
- Due diligence considerations
- Market positioning and competitive landscape
- Funding history and growth potential
- Key personnel and leadership
- Strategic partnerships and relationships
- Technology stack and innovation
- Market opportunity and scalability
- Risk factors and challenges
- Exit potential and valuation metrics`;
      break;
      
    case 'contact':
      content = `Contact: ${entity.name}
Title: ${entity.title || 'N/A'}
Email: ${entity.email || 'N/A'}
Company: ${entity.companies?.name || 'N/A'}
Industry: ${entity.companies?.industry || 'N/A'}

Investment Context:
- Decision-making authority and influence
- Investment experience and track record
- Network and relationship strength
- Industry expertise and insights
- Communication preferences and availability
- Previous investment patterns
- Warm introduction potential
- Strategic value and connections
- Due diligence insights`;
      break;
      
    case 'interaction':
      content = `Interaction: ${entity.interaction_type || 'N/A'}
Subject: ${entity.subject || 'N/A'}
Content: ${entity.content_preview || 'N/A'}
Participants: ${entity.participants?.join(', ') || 'N/A'}
Date: ${entity.started_at || 'N/A'}

Investment Context:
- Relationship building opportunities
- Due diligence insights
- Market intelligence gathering
- Partnership discussions
- Investment interest signals
- Competitive intelligence
- Strategic alignment indicators`;
      break;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: content
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// ============================================================================
// INVESTMENT INTELLIGENCE GENERATION
// ============================================================================

async function generateInvestmentIntelligence(entity: any, entityType: string, query: InvestmentQuery): Promise<any> {
  if (!OPENAI_API_KEY) {
    return {
      due_diligence_notes: ['Manual analysis recommended'],
      funding_intelligence: 'Analysis pending',
      market_position: 'Unknown',
      competitive_landscape: [],
      relationship_opportunities: [],
      risk_factors: ['Limited data available'],
      next_steps: ['Gather more information']
    };
  }

  const prompt = `Generate comprehensive investment intelligence for this ${entityType}:

Entity: ${JSON.stringify(entity, null, 2)}

Query Context: ${query.context}
Intent: ${query.intent}
Search Terms: ${query.search_terms.join(', ')}

Provide detailed analysis in JSON format:
{
  "due_diligence_notes": ["specific due diligence considerations"],
  "funding_intelligence": "funding history, valuation, growth metrics",
  "market_position": "competitive positioning and market share",
  "competitive_landscape": ["key competitors and differentiators"],
  "relationship_opportunities": ["warm introduction paths and relationship building"],
  "risk_factors": ["specific risks and challenges"],
  "next_steps": ["actionable next steps for investment process"]
}

Focus on practical investment insights, due diligence considerations, and actionable intelligence.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert investment analyst with deep expertise in due diligence, market analysis, and relationship intelligence. Provide actionable investment insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Clean and parse JSON response
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return JSON.parse(cleanContent);
  } catch (error) {
    console.error('Error generating investment intelligence:', error);
    return {
      due_diligence_notes: ['Analysis pending - manual review recommended'],
      funding_intelligence: 'Limited data available',
      market_position: 'Unknown - needs assessment',
      competitive_landscape: [],
      relationship_opportunities: [],
      risk_factors: ['Limited data available'],
      next_steps: ['Gather more information']
    };
  }
}

// ============================================================================
// UNIVERSAL SEARCH FUNCTIONS
// ============================================================================

async function performUniversalSearch(query: InvestmentQuery): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  // Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query.context);
  
  // Search across all entity types
  for (const entityType of query.entity_types) {
    const entityResults = await searchEntityType(entityType, query, queryEmbedding);
    results.push(...entityResults);
  }
  
  // Sort by relevance score
  return results.sort((a, b) => b.relevance_score - a.relevance_score).slice(0, query.max_results);
}

async function generateQueryEmbedding(query: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: query
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw error;
  }
}

async function textSearchFallback(entityType: string, query: InvestmentQuery, entities: any[]): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const searchTerms = query.search_terms.map(term => term.toLowerCase());
  
  console.log(`Performing text search fallback for ${entities.length} entities`);
  
  for (const entity of entities) {
    const entityText = `${entity.name || ''} ${entity.description || ''} ${entity.domain || ''} ${entity.industry || ''}`.toLowerCase();
    
    // Check if any search term matches
    const matches = searchTerms.some(term => entityText.includes(term));
    
    if (matches) {
      console.log(`Text match found for entity: ${entity.name}`);
      
      // Generate investment intelligence
      const investmentInsights = await generateInvestmentIntelligence(entity, entityType, query);
      
      // Get existing intelligence data
      const { data: intelligenceData } = await supabaseClient
        .from('universal_intelligence')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entity.id)
        .single();

      // Get embedding data
      const { data: embeddingData } = await supabaseClient
        .from('entity_embeddings')
        .select('text_content, vector')
        .eq('entity_type', entityType)
        .eq('entity_id', entity.id)
        .single();

      results.push({
        type: entityType as any,
        id: entity.id,
        title: entity.name || entity.title || entity.subject || 'Unknown',
        description: entity.description || entity.title || entity.content_preview || 'No description available',
        relevance_score: 0.8, // High score for text matches
        investment_insights: investmentInsights,
        existing_intelligence: intelligenceData,
        embedding_data: {
          text_content: embeddingData?.text_content || 'No embedding content',
          vector_dimensions: embeddingData?.vector ? JSON.parse(embeddingData.vector).length : 0,
          has_embedding: !!embeddingData?.vector
        },
        metadata: entity
      });
    }
  }
  
  console.log(`Text search fallback found ${results.length} results`);
  return results;
}

async function searchEntityType(entityType: string, query: InvestmentQuery, queryEmbedding: number[]): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    // Get entities with embeddings
    const { data: entities } = await supabaseClient
      .from(entityType === 'company' ? 'companies' : entityType === 'contact' ? 'contacts' : 'interactions')
      .select(`
        *,
        ${entityType === 'contact' ? 'companies(name, industry, domain)' : ''}
      `)
      .limit(50);

    if (!entities) {
      console.log(`No entities found for type: ${entityType}`);
      return results;
    }

    console.log(`Found ${entities.length} entities for type: ${entityType}`);

    // Get embeddings for these entities
    const { data: embeddings } = await supabaseClient
      .from('entity_embeddings')
      .select('entity_id, vector')
      .eq('entity_type', entityType === 'company' ? 'company' : entityType === 'contact' ? 'contact' : 'interaction')
      .in('entity_id', entities.map(e => e.id));

    if (!embeddings || embeddings.length === 0) {
      console.log(`No embeddings found for type: ${entityType}, falling back to text search`);
      return await textSearchFallback(entityType, query, entities);
    }

    console.log(`Found ${embeddings.length} embeddings for type: ${entityType}`);

    // Calculate similarity scores
    for (const entity of entities) {
      const embedding = embeddings.find(e => e.entity_id === entity.id);
      if (!embedding) continue;

      const similarity = calculateSimilarity(queryEmbedding, embedding.vector);
      
      if (similarity > 0.1) { // Lower threshold for relevance
        // Generate investment intelligence
        const investmentInsights = await generateInvestmentIntelligence(entity, entityType, query);
        
        // Get existing intelligence data
        const { data: intelligenceData } = await supabaseClient
          .from('universal_intelligence')
          .select('*')
          .eq('entity_type', entityType)
          .eq('entity_id', entity.id)
          .single();

        // Get embedding data
        const { data: embeddingData } = await supabaseClient
          .from('entity_embeddings')
          .select('text_content, vector')
          .eq('entity_type', entityType)
          .eq('entity_id', entity.id)
          .single();
        
        results.push({
          type: entityType as any,
          id: entity.id,
          title: entity.name || entity.title || entity.subject || 'Unknown',
          description: entity.description || entity.title || entity.content_preview || 'No description available',
          relevance_score: similarity,
          investment_insights: investmentInsights,
          existing_intelligence: intelligenceData,
          embedding_data: {
            text_content: embeddingData?.text_content || 'No embedding content',
            vector_dimensions: embeddingData?.vector ? JSON.parse(embeddingData.vector).length : 0,
            has_embedding: !!embeddingData?.vector
          },
          metadata: entity
        });
      }
    }
  } catch (error) {
    console.error(`Error searching ${entityType}:`, error);
  }

  return results;
}

function calculateSimilarity(vector1: number[], vector2: number[] | string): number {
  // Parse string vectors if needed
  const v1 = vector1;
  const v2 = typeof vector2 === 'string' ? JSON.parse(vector2) : vector2;

  if (v1.length !== v2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// ============================================================================
// WARM INTRODUCTIONS INTEGRATION
// ============================================================================

async function findWarmIntroductions(targetContactId: string, maxPathLength: number = 3): Promise<SearchResult[]> {
  try {
    // Get target contact
    const { data: targetContact } = await supabaseClient
      .from('contacts')
      .select(`
        id, name, title, email,
        companies(name, domain)
      `)
      .eq('id', targetContactId)
      .single();

    if (!targetContact) {
      throw new Error('Target contact not found');
    }

    // Get all contacts and relationships
    const { data: allContacts } = await supabaseClient
      .from('contacts')
      .select(`
        id, name, title, email,
        companies(name, domain)
      `);

    if (!allContacts) {
      throw new Error('No contacts found');
    }

    // Get relationships
    const { data: relationships } = await supabaseClient
      .from('relationships')
      .select('from_contact, to_contact, relationship_type, strength');

    if (!relationships) {
      throw new Error('No relationships found');
    }

    // Build relationship graph
    const graph = buildRelationshipGraph(allContacts, relationships);
    
    // Find paths using BFS
    const paths = findPathsBFS(graph, targetContactId, maxPathLength, 0.3);

    // Convert paths to search results
    const results: SearchResult[] = [];
    
    for (const path of paths) {
      const pathContacts = path.map(step => 
        allContacts.find(c => c.id === step.contactId)
      ).filter(Boolean);

      const totalStrength = path.reduce((sum, step) => sum + step.strength, 0) / path.length;
      
      results.push({
        type: 'warm_introduction',
        id: `intro-${targetContactId}-${path.length}`,
        title: `Warm Introduction to ${targetContact.name}`,
        description: `Path through ${pathContacts.map(c => c.name).join(' → ')}`,
        relevance_score: totalStrength,
        investment_insights: {
          due_diligence_notes: [`Introduction path strength: ${(totalStrength * 100).toFixed(1)}%`],
          funding_intelligence: 'Warm introduction opportunity',
          market_position: 'Relationship-based access',
          competitive_landscape: [],
          relationship_opportunities: [`Connect through ${pathContacts[0]?.name}`],
          risk_factors: ['Relationship strength may vary'],
          next_steps: [`Reach out to ${pathContacts[0]?.name} for introduction`]
        },
        metadata: {
          target_contact: targetContact,
          path: pathContacts,
          total_strength: totalStrength
        }
      });
    }

    return results;
  } catch (error) {
    console.error('Error finding warm introductions:', error);
    return [];
  }
}

function buildRelationshipGraph(contacts: any[], relationships: any[]): Map<string, Array<{contactId: string, strength: number, type: string}>> {
  const graph = new Map<string, Array<{contactId: string, strength: number, type: string}>>();
  
  for (const contact of contacts) {
    if (!graph.has(contact.id)) {
      graph.set(contact.id, []);
    }
  }
  
  for (const rel of relationships) {
    if (rel.from_contact && rel.to_contact && rel.from_contact !== rel.to_contact) {
      if (!graph.has(rel.from_contact)) {
        graph.set(rel.from_contact, []);
      }
      graph.get(rel.from_contact)!.push({
        contactId: rel.to_contact,
        strength: rel.strength || 0.5,
        type: rel.relationship_type || 'unknown'
      });
    }
  }
  
  return graph;
}

function findPathsBFS(
  graph: Map<string, Array<{contactId: string, strength: number, type: string}>>,
  targetId: string,
  maxLength: number,
  minStrength: number
): Array<Array<{contactId: string, strength: number, type: string}>> {
  const paths: Array<Array<{contactId: string, strength: number, type: string}>> = [];
  const queue: Array<{path: Array<{contactId: string, strength: number, type: string}>, visited: Set<string>}> = [];
  
  // Start from all contacts (potential introducers)
  for (const [contactId] of graph) {
    if (contactId !== targetId) {
      queue.push({
        path: [],
        visited: new Set([contactId])
      });
    }
  }
  
  while (queue.length > 0) {
    const { path, visited } = queue.shift()!;
    
    if (path.length >= maxLength) continue;
    
    const currentContactId = path.length === 0 ? 
      Array.from(visited)[0] : 
      path[path.length - 1].contactId;
    
    const relationships = graph.get(currentContactId) || [];
    
    for (const rel of relationships) {
      if (visited.has(rel.contactId)) continue;
      if (rel.strength < minStrength) continue;
      
      const newPath = [...path, rel];
      const newVisited = new Set(visited);
      newVisited.add(rel.contactId);
      
      if (rel.contactId === targetId) {
        paths.push(newPath);
      } else if (newPath.length < maxLength) {
        queue.push({ path: newPath, visited: newVisited });
      }
    }
  }
  
  return paths;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    // Security check
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { query, include_warm_introductions = false, target_contact_id } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Universal search query: "${query}"`);

    // Process natural language query
    const investmentQuery = await processNaturalLanguageQuery(query);
    
    // Perform universal search
    const searchResults = await performUniversalSearch(investmentQuery);
    
    // Add warm introductions if requested
    let warmIntroductions: SearchResult[] = [];
    if (include_warm_introductions && target_contact_id) {
      warmIntroductions = await findWarmIntroductions(target_contact_id);
    }

    // Combine results
    const allResults = [...searchResults, ...warmIntroductions]
      .sort((a, b) => b.relevance_score - a.relevance_score);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        query: investmentQuery,
        results: allResults,
        count: allResults.length,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in universal search:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})
