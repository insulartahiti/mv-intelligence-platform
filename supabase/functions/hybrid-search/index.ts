import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MV_WEBHOOK_SECRET");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "text-embedding-3-large",
        input: text
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error("Embedding generation error:", error);
    throw error;
  }
}

// ============================================================================
// NATURAL LANGUAGE QUERY PROCESSING
// ============================================================================

async function processNaturalLanguageQuery(query: string): Promise<{
  searchTerms: string[];
  entityTypes: string[];
  intent: string;
  filters: Record<string, any>;
}> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a search query analyzer for a fintech/venture capital knowledge graph. 
            Analyze the user's natural language query and extract:
            1. Key search terms
            2. Entity types they're looking for (company, contact, interaction, etc.)
            3. Search intent (find, compare, analyze, etc.)
            4. Any filters (industry, location, funding stage, etc.)
            
            Return a JSON object with: searchTerms, entityTypes, intent, filters`
          },
          {
            role: "user",
            content: query
          }
        ],
        max_completion_tokens: 300,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      return JSON.parse(content);
    } catch (parseError) {
      // Fallback parsing
      return {
        searchTerms: [query],
        entityTypes: ['all'],
        intent: 'search',
        filters: {}
      };
    }
  } catch (error) {
    console.error("Natural language processing error:", error);
    return {
      searchTerms: [query],
      entityTypes: ['all'],
      intent: 'search',
      filters: {}
    };
  }
}

// ============================================================================
// ENHANCED SEARCH FUNCTIONS
// ============================================================================

async function hybridSearch(query: string, limit: number = 20): Promise<any[]> {
  try {
    // Generate query embedding
    const queryVector = await generateEmbedding(query);

    // Perform hybrid search using the database function
    const { data, error } = await supabase.rpc('hybrid_search', {
      query_text: query,
      query_vector: queryVector,
      limit_count: limit
    });

    if (error) {
      console.error("Hybrid search error:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Hybrid search error:", error);
    throw error;
  }
}

async function naturalLanguageSearch(query: string, limit: number = 20): Promise<any> {
  try {
    // Process the natural language query
    const queryAnalysis = await processNaturalLanguageQuery(query);
    console.log("Query analysis:", queryAnalysis);

    const results: any = {
      query_analysis: queryAnalysis,
      companies: [],
      contacts: [],
      interactions: [],
      intelligence: []
    };

    // Generate query embedding for semantic search
    const queryVector = await generateEmbedding(query);

    // Search companies with enhanced context
    if (queryAnalysis.entityTypes.includes('all') || queryAnalysis.entityTypes.includes('company')) {
      // First get all companies
      const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .limit(limit * 2); // Get more to filter later

      if (!companyError && companies) {
        // Get embeddings for these companies
        const companyIds = companies.map(c => c.id);
        const { data: embeddings, error: embeddingError } = await supabase
          .from('entity_embeddings')
          .select('entity_id, vector')
          .eq('entity_type', 'company')
          .in('entity_id', companyIds);

        if (!embeddingError && embeddings) {
          // Create a map of company_id to embedding
          const embeddingMap = new Map(embeddings.map(e => [e.entity_id, e.vector]));
          
          // Filter and rank companies based on semantic similarity
          const rankedCompanies = companies
            .map(company => {
              const embedding = embeddingMap.get(company.id);
              const score = embedding ? calculateSimilarity(queryVector, embedding) : 0;
              console.log(`Company ${company.name}: similarity score = ${score}`);
              return {
                ...company,
                relevance_score: score
              };
            })
            .filter(company => company.relevance_score > 0.1)
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, limit);

          results.companies = rankedCompanies;
        }
      }
    }

    // Search contacts with enhanced context
    if (queryAnalysis.entityTypes.includes('all') || queryAnalysis.entityTypes.includes('contact')) {
      const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select(`
          *,
          companies(name, industry, domain)
        `)
        .limit(limit * 2);

      if (!contactError && contacts) {
        const contactIds = contacts.map(c => c.id);
        const { data: embeddings, error: embeddingError } = await supabase
          .from('entity_embeddings')
          .select('entity_id, vector')
          .eq('entity_type', 'contact')
          .in('entity_id', contactIds);

        if (!embeddingError && embeddings) {
          const embeddingMap = new Map(embeddings.map(e => [e.entity_id, e.vector]));
          
          const rankedContacts = contacts
            .map(contact => {
              const embedding = embeddingMap.get(contact.id);
              return {
                ...contact,
                relevance_score: embedding ? calculateSimilarity(queryVector, embedding) : 0
              };
            })
            .filter(contact => contact.relevance_score > 0.1)
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, limit);

          results.contacts = rankedContacts;
        }
      }
    }

    // Search interactions
    if (queryAnalysis.entityTypes.includes('all') || queryAnalysis.entityTypes.includes('interaction')) {
      const { data: interactions, error: interactionError } = await supabase
        .from('interactions')
        .select('*')
        .limit(limit * 2);

      if (!interactionError && interactions) {
        const interactionIds = interactions.map(i => i.id);
        const { data: embeddings, error: embeddingError } = await supabase
          .from('entity_embeddings')
          .select('entity_id, vector')
          .eq('entity_type', 'interaction')
          .in('entity_id', interactionIds);

        if (!embeddingError && embeddings) {
          const embeddingMap = new Map(embeddings.map(e => [e.entity_id, e.vector]));
          
          const rankedInteractions = interactions
            .map(interaction => {
              const embedding = embeddingMap.get(interaction.id);
              return {
                ...interaction,
                relevance_score: embedding ? calculateSimilarity(queryVector, embedding) : 0
              };
            })
            .filter(interaction => interaction.relevance_score > 0.1)
            .sort((a, b) => b.relevance_score - a.relevance_score)
            .slice(0, limit);

          results.interactions = rankedInteractions;
        }
      }
    }

    // Get intelligence overlays for top results
    const allEntityIds = [
      ...results.companies.map(c => ({ type: 'company', id: c.id })),
      ...results.contacts.map(c => ({ type: 'contact', id: c.id })),
      ...results.interactions.map(i => ({ type: 'interaction', id: i.id }))
    ].slice(0, 10);

    if (allEntityIds.length > 0) {
      const { data: intelligence, error: intelError } = await supabase
        .from('universal_intelligence')
        .select('*')
        .in('entity_type', allEntityIds.map(e => e.type))
        .in('entity_id', allEntityIds.map(e => e.id));

      if (!intelError && intelligence) {
        results.intelligence = intelligence;
      }
    }

    return results;
  } catch (error) {
    console.error("Natural language search error:", error);
    throw error;
  }
}

function calculateSimilarity(vector1: number[] | string, vector2: number[] | string): number {
  // Parse string vectors if needed
  const v1 = typeof vector1 === 'string' ? JSON.parse(vector1) : vector1;
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

async function searchContacts(query: string, limit: number = 10): Promise<any[]> {
  try {
    // Generate query embedding
    const queryVector = await generateEmbedding(query);

    // Search contacts using vector similarity on their names and titles
    const { data, error } = await supabase
      .from('contacts')
      .select(`
        id,
        name,
        email,
        title,
        company_id,
        companies!inner(name, domain, industry)
      `)
      .textSearch('name', query, { type: 'websearch' })
      .limit(limit);

    if (error) {
      console.error("Contact search error:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Contact search error:", error);
    throw error;
  }
}

async function searchCompanies(query: string, limit: number = 10): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        id,
        name,
        domain,
        industry,
        company_type,
        description,
        employees,
        funding_stage,
        revenue_range,
        location
      `)
      .textSearch('name', query, { type: 'websearch' })
      .limit(limit);

    if (error) {
      console.error("Company search error:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Company search error:", error);
    throw error;
  }
}

async function findWarmPaths(sourceContactId: string, targetCompanyId: string, k: number = 5): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('find_warm_paths', {
      source_contact_id: sourceContactId,
      target_company_id: targetCompanyId,
      max_hops: 2
    });

    if (error) {
      console.error("Warm paths error:", error);
      throw error;
    }

    // Get contact details for the paths
    const contactIds = new Set<string>();
    (data || []).forEach((path: any) => {
      path.path_contacts.forEach((id: string) => contactIds.add(id));
    });

    if (contactIds.size === 0) return [];

    const { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .select('id, name, email, title, company_id, companies!inner(name)')
      .in('id', Array.from(contactIds));

    if (contactError) {
      console.error("Contact fetch error:", contactError);
      throw contactError;
    }

    const contactMap = new Map(contacts?.map(c => [c.id, c]) || []);

    // Format paths with contact details
    return (data || []).slice(0, k).map((path: any) => ({
      ...path,
      contacts: path.path_contacts.map((id: string) => contactMap.get(id) || { id })
    }));
  } catch (error) {
    console.error("Warm paths error:", error);
    throw error;
  }
}

// ============================================================================
// MAIN SEARCH HANDLER
// ============================================================================

Deno.serve(async (req) => {
  try {
    // Security check
    if (WEBHOOK_SECRET && req.headers.get("x-mv-signature") !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { 
      query, 
      search_type = 'natural_language', 
      limit = 20,
      source_contact_id,
      target_company_id,
      k = 5
    } = await req.json();

    if (!query && !source_contact_id) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Query parameter is required"
      }), { status: 400 });
    }

    let results: any = {};

    switch (search_type) {
      case 'natural_language':
        results = await naturalLanguageSearch(query, limit);
        break;
        
      case 'hybrid':
        results.hybrid = await hybridSearch(query, limit);
        break;
      
      case 'contacts':
        results.contacts = await searchContacts(query, limit);
        break;
      
      case 'companies':
        results.companies = await searchCompanies(query, limit);
        break;
      
      case 'warm_paths':
        if (!source_contact_id || !target_company_id) {
          return new Response(JSON.stringify({
            ok: false,
            error: "source_contact_id and target_company_id are required for warm paths"
          }), { status: 400 });
        }
        results.warm_paths = await findWarmPaths(source_contact_id, target_company_id, k);
        break;
      
      case 'all':
        results.hybrid = await hybridSearch(query, limit);
        results.contacts = await searchContacts(query, Math.min(limit, 10));
        results.companies = await searchCompanies(query, Math.min(limit, 10));
        break;
      
      default:
        return new Response(JSON.stringify({
          ok: false,
          error: "Invalid search_type. Use: natural_language, hybrid, contacts, companies, warm_paths, or all"
        }), { status: 400 });
    }

    return new Response(JSON.stringify({
      ok: true,
      query,
      search_type,
      results,
      timestamp: new Date().toISOString()
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Search error:", error);
    return new Response(JSON.stringify({
      ok: false,
      error: String(error),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
