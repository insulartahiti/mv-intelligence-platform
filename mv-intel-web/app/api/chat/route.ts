import { NextRequest, NextResponse } from 'next/server';
import { ChatService } from '@/lib/chat/service';
import { searchEntities } from '@/lib/search/postgres-vector';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Force dynamic route
export const dynamic = 'force-dynamic';

// --- HELPERS ---

// Helper to fetch subgraph - using parallel queries for robustness
async function fetchSubgraph(nodeIds: string[], supabase: any) {
    if (nodeIds.length === 0) return { nodes: [], edges: [] };

    // 1. Fetch Nodes (Rich Data)
    const { data: nodes } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, industry, importance, is_portfolio, is_pipeline, business_analysis, ai_summary, description, location_country, enrichment_data')
        .in('id', nodeIds);

    // 2. Fetch Edges (Split into two queries to avoid .or() issues)
    console.log(`FetchSubgraph: Getting edges for ${nodeIds.length} nodes...`);

    const { data: edgesAsSource, error: sourceError } = await supabase
        .schema('graph')
        .from('edges')
        .select('id, source, target, kind')
        .in('source', nodeIds)
        .limit(2000);

    if (sourceError) console.error('Error fetching edgesAsSource:', sourceError);

    const { data: edgesAsTarget, error: targetError } = await supabase
        .schema('graph')
        .from('edges')
        .select('id, source, target, kind')
        .in('target', nodeIds)
        .limit(2000);

    if (targetError) console.error('Error fetching edgesAsTarget:', targetError);

    console.log(`FetchSubgraph: Found ${edgesAsSource?.length || 0} source edges, ${edgesAsTarget?.length || 0} target edges.`);

    // Merge edges
    const edgeMap = new Map();
    edgesAsSource?.forEach((e: any) => edgeMap.set(e.id, e));
    edgesAsTarget?.forEach((e: any) => edgeMap.set(e.id, e));
    const allEdges = Array.from(edgeMap.values());

    // 3. Fetch secondary nodes (endpoints of expansion edges not in original set)
    const extraNodeIds = new Set<string>();
    allEdges.forEach((e: any) => {
        if (!nodeIds.includes(e.source)) extraNodeIds.add(e.source);
        if (!nodeIds.includes(e.target)) extraNodeIds.add(e.target);
    });

    let allNodes = nodes || [];
    if (extraNodeIds.size > 0) {
        const { data: extras } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, type, industry, importance, is_portfolio, is_pipeline, business_analysis, ai_summary, description, location_country')
            .in('id', Array.from(extraNodeIds))
            .limit(1500); 
        
        if (extras) {
            // Deduplicate
            const existingIds = new Set(allNodes.map(n => n.id));
            extras.forEach(n => {
                if (!existingIds.has(n.id)) {
                    allNodes.push(n);
                }
            });
        }
    }

    // NEW LOGIC: Fetch 2nd-degree edges to show connectivity BETWEEN the visible nodes.
    const visibleNodeIds = allNodes.map(n => n.id);
    
    // Only perform this "densification" if we have a reasonable number of nodes to avoid timeouts.
    if (visibleNodeIds.length > 0 && visibleNodeIds.length < 400) {
        console.log(`Densifying graph for ${visibleNodeIds.length} visible nodes...`);
        
        // Optimization: Limit the scope of secondary nodes we check for dense connections
        const secondaryIds = Array.from(extraNodeIds).slice(0, 300);
        
        if (secondaryIds.length > 0) {
             const { data: denseEdges, error: denseError } = await supabase
                .schema('graph')
                .from('edges')
                .select('id, source, target, kind')
                .in('source', secondaryIds) // Edges starting from secondary nodes
                .in('target', visibleNodeIds) // ...and ending at ANY visible node
                .limit(500);
                
             if (denseEdges) {
                 denseEdges.forEach(e => {
                     // Avoid duplicates
                     if (!edgeMap.has(e.id)) {
                         edgeMap.set(e.id, e);
                         allEdges.push(e);
                     }
                 });
             }
        }
    }

    // 4. Filter edges to ensure endpoints exist (prevent "dangling" edges due to limits)
    const validNodeIds = new Set(allNodes.map(n => n.id));
    const validEdges = allEdges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));

    return {
        nodes: allNodes
            .sort((a: any, b: any) => {
                const indexA = nodeIds.indexOf(a.id);
                const indexB = nodeIds.indexOf(b.id);
                // If not in nodeIds (extra secondary nodes), push to end
                if (indexA === -1 && indexB === -1) return 0;
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            })
            .map((n: any) => {
                // Map missing fields from enrichment_data or business_analysis
                const industry = n.industry || 
                                n.enrichment_data?.industry || 
                                n.business_analysis?.industry || 
                                (Array.isArray(n.enrichment_data?.industries) ? n.enrichment_data?.industries[0] : null) ||
                                (Array.isArray(n.business_analysis?.industries) ? n.business_analysis?.industries[0] : null);

                const country = n.location_country || 
                               n.enrichment_data?.location?.country || 
                               n.enrichment_data?.country ||
                               n.business_analysis?.headquarters_country ||
                               n.business_analysis?.location?.country;

                return {
                    id: n.id,
                    label: n.name,
                    group: n.type,
                    properties: {
                        ...n,
                        industry,
                        location_country: country
                    }
                };
            }),
        edges: validEdges.map((e: any) => ({
            id: e.id,
            from: e.source,
            to: e.target,
            label: e.kind,
            properties: e
        }))
    };
}

// Helper for Similarity Search (Companies)
async function findSimilarEntities(entityId: string, supabase: any) {
    const { data: entity } = await supabase
        .schema('graph')
        .from('entities')
        .select('embedding, name')
        .eq('id', entityId)
        .single();
    
    if (!entity?.embedding) return [];

    console.log(`🔎 Finding similar to: ${entity.name}`);

    const { data: results, error } = await supabase.rpc('search_entities_filtered', {
        query_embedding: entity.embedding,
        match_threshold: 0.6, 
        match_count: 20,
        filters: { type: 'organization' }
    });
    
    if (error) console.error('Similarity search error:', error);
    return results || [];
}

// Helper to fetch key people for an organization
async function getEntityConnections(entityId: string, supabase: any) {
    const { data: edges } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, kind')
        .eq('target', entityId)
        .in('kind', ['works_at', 'owner', 'deal_team', 'advises', 'board_member', 'contact', 'founder', 'founder_of'])
        .limit(10);

    if (!edges || edges.length === 0) return "";

    const sourceIds = edges.map(e => e.source);
    const { data: people } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .in('id', sourceIds)
        .eq('type', 'person');

    if (!people || people.length === 0) return "";

    return people.map(p => {
        const edge = edges.find(e => e.source === p.id);
        const kind = edge?.kind;
        return `${p.name} (${kind})`;
    });

    return connections.join(', ');
}

// Helper to fetch rich details for a person
async function getPersonDetails(personId: string, supabase: any) {
    const { data: person } = await supabase
        .schema('graph')
        .from('entities')
        .select('employment_history, business_analysis, description, enrichment_data')
        .eq('id', personId)
        .single();
    
    if (!person) return "";

    let details = "";
    
    const email = person.enrichment_data?.email || 
                  person.enrichment_data?.contact_info?.email || 
                  person.enrichment_data?.contact?.email ||
                  (Array.isArray(person.enrichment_data?.emails) ? person.enrichment_data?.emails[0] : null);

    if (email) details += `Email: ${email}\n`;

    const phone = person.enrichment_data?.phone || 
                  person.enrichment_data?.contact_info?.phone || 
                  person.enrichment_data?.mobile ||
                  (Array.isArray(person.enrichment_data?.phones) ? person.enrichment_data?.phones[0] : null);

    if (phone) details += `Phone: ${phone}\n`;
    
    if (person.employment_history) {
        const history = Array.isArray(person.employment_history) ? person.employment_history : [];
        const current = history.filter((h: any) => h.current || !h.end_date);
        if (current.length > 0) {
            details += `Current Role: ${current.map((h:any) => `${h.title || 'Role'} at ${h.company || 'Unknown'}`).join('; ')}\n`;
        }
        
        const past = history.filter((h: any) => !h.current && h.end_date).slice(0, 3);
        if (past.length > 0) {
            details += `Past Roles: ${past.map((h:any) => `${h.title || 'Role'} at ${h.company || 'Unknown'}`).join('; ')}\n`;
        }
    }

    if (person.description) details += `Bio: ${person.description}\n`;
    
    if (person.business_analysis && typeof person.business_analysis === 'string') {
        details += `Analysis: ${person.business_analysis.substring(0, 300)}...\n`;
    } else if (person.business_analysis?.key_achievements) {
        details += `Achievements: ${JSON.stringify(person.business_analysis.key_achievements).substring(0, 300)}...\n`;
    }
    
    return details;
}

// Helper for Notes Search
async function searchInteractions(query: string, supabase: any, entityId?: string) {
    try {
        const embeddingResponse = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).embeddings.create({
            model: 'text-embedding-3-large',
            input: query,
            dimensions: 2000
        });
        const embedding = embeddingResponse.data[0].embedding;

        const { data, error } = await supabase.rpc('search_interactions', {
            query_embedding: embedding,
            match_threshold: 0.5, 
            match_count: 5,
            filter_entity_id: entityId || null
        });

        if (error) {
            console.error('Error searching notes:', error);
            return [];
        }
        return data || [];
    } catch (e) {
        console.error('Error in searchInteractions:', e);
        return [];
    }
}

// Helper for User Connection Search (My Deals)
async function getUserConnections(userId: string, supabase: any, connectionTypes?: string[], isPortfolio?: boolean) {
    const types = connectionTypes || ['owner', 'deal_team', 'sourced_by', 'board_member'];
    
    let query = supabase
        .schema('graph')
        .from('edges')
        .select('target, kind, entities!target(id, name, type, industry, description, business_analysis, is_portfolio, pipeline_stage)')
        .eq('source', userId)
        .in('kind', types);

    if (isPortfolio) {
        query = query.eq('entities.is_portfolio', true); 
    }

    const { data: edges, error } = await query;

    if (error) {
        console.error('Error fetching user connections:', error);
        return [];
    }

    const connectedEntities = edges
        ?.map((e: any) => {
            if (!e.entities) return null;
            return {
                ...e.entities,
                connection_kind: e.kind
            };
        })
        .filter((e: any) => e !== null);

    if (isPortfolio) {
        return connectedEntities.filter((e: any) => e.is_portfolio === true);
    }

    return connectedEntities || [];
}

// Helper for Graph Traversal
async function traverseGraph(startNodeId: string, supabase: any, direction: 'in' | 'out' | 'both' = 'both', relationshipType?: string) {
    let query = supabase
        .schema('graph')
        .from('edges')
        .select('id, source, target, kind, entities!target(id, name, type), entities!source(id, name, type)')
        .limit(30);

    if (direction === 'out') {
        query = query.eq('source', startNodeId);
    } else if (direction === 'in') {
        query = query.eq('target', startNodeId);
    } else {
        const { data: outEdges } = await supabase.schema('graph').from('edges').select('id, source, target, kind, entities!target(id, name, type)').eq('source', startNodeId).limit(20);
        const { data: inEdges } = await supabase.schema('graph').from('edges').select('id, source, target, kind, entities!source(id, name, type)').eq('target', startNodeId).limit(20);
        
        const combined = [...(outEdges || []), ...(inEdges || [])];
        if (relationshipType) return combined.filter(e => e.kind === relationshipType);
        return combined;
    }

    if (relationshipType) {
        query = query.eq('kind', relationshipType);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error traversing graph:', error);
        return [];
    }
    return data || [];
}

// Helper to expand IDs by Name (Split Brain Fix)
async function expandIDsByName(initialIDs: string[], names: string[], supabase: any): Promise<string[]> {
    if (names.length === 0) return [];
    
    const { data: siblings } = await supabase
        .schema('graph')
        .from('entities')
        .select('id')
        .in('name', names)
        .limit(100);
    
    if (siblings) {
        return siblings.map(s => s.id);
    }
    return [];
}

// OpenAI Tool Definitions
const webSearchTool = {
  type: "function",
  function: {
    name: "perform_web_search",
    description: "Search the live web for real-time information, news, or companies NOT in the database. Use this when the user asks for external search, 'latest' news, regulations, market trends, or current events.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query optimized for a search engine." }
      },
      required: ["query"]
    }
  }
};

const tools = [
  {
    type: "function",
    function: {
      name: "search_knowledge_graph",
      description: "Search for companies, people, or concepts. Use this to find entities or answer questions about the market.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query string." },
          filters: {
            type: "object",
            properties: {
              countries: { type: "array", items: { type: "string" } },
              industries: { type: "array", items: { type: "string" } },
              isPortfolio: { type: "boolean" },
              seniority: { type: "array", items: { type: "string" } },
              types: { type: "array", items: { type: "string", enum: ["organization", "person"] }, description: "Filter by entity type. Use ['person'] for people searches, ['organization'] for companies." }
            }
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "traverse_graph",
      description: "Explore relationships connected to a specific entity. Use this to find investors, key people, or related companies. Equivalent to 'Who is connected to X?'.",
      parameters: {
        type: "object",
        properties: {
          startNodeId: { type: "string", description: "The ID of the entity to start traversal from." },
          direction: { type: "string", enum: ["in", "out", "both"], description: "Direction of traversal. 'out' for forward edges (e.g. X invested in Y), 'in' for incoming (e.g. Y was invested by X)." },
          relationshipType: { type: "string", description: "Optional: Filter by specific edge type (e.g. 'invested_in', 'works_at', 'owner')." }
        },
        required: ["startNodeId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_deals",
      description: "Get companies connected to the current user (e.g. where they are owner, deal team, or sourced by). Use this when user asks for 'my deals', 'my portfolio', or 'companies I work with'.",
      parameters: {
        type: "object",
        properties: {
          isPortfolio: { type: "boolean", description: "If true, only return closed/portfolio companies. If false/undefined, return all pipeline deals." }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_similar_companies",
      description: "Find companies similar to a specific company ID based on business model and vector embedding. Use this when user asks 'companies like X' or 'competitors of X'.",
      parameters: {
        type: "object",
        properties: {
          entityId: { type: "string", description: "The UUID of the company to match against. You must search for the company first to get its ID." }
        },
        required: ["entityId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "Search internal meeting notes, emails, and interaction history. Use this when user asks 'what did we discuss with X' or 'search emails about Y' or 'notes on Z'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The semantic search query." },
          entityId: { type: "string", description: "Optional UUID of the company/person to filter notes by. Use this if the user asks about a specific entity."           }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "draft_message",
      description: "Draft a message for the user via Email, SMS, or WhatsApp. Use this when the user asks to 'draft an email', 'text someone', or 'send a whatsapp'. FIRST search for the person to find their contact info.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["email", "sms", "whatsapp"], description: "The communication channel to use." },
          recipient_name: { type: "string", description: "Name of the person." },
          recipient_contact: { type: "string", description: "Email address or Phone number of the recipient (if found)." },
          subject: { type: "string", description: "Subject line (for emails only)." },
          body: { type: "string", description: "Content of the message." }
        },
        required: ["channel", "recipient_name", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_legal_analysis",
      description: "Retrieve a past legal document analysis for a portfolio company. Use this when user asks about term sheets, deal terms, investment documents, SAFEs, CLAs, or legal terms for a company.",
      parameters: {
        type: "object",
        properties: {
          companyId: { type: "string", description: "The UUID of the company to get legal analyses for. Search for the company first to get its ID." },
          analysisId: { type: "string", description: "Optional: Specific analysis ID to retrieve." }
        }
      }
    }
  }
];


export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message, conversationId: existingId, userEntity, enableExternalSearch } = body;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const chatService = new ChatService();
        
        // Create stream
        const stream = new ReadableStream({
            async start(controller) {
                // Helper to send events
                const sendEvent = (type: string, data: any) => {
                    const payload = JSON.stringify({ type, ...data });
                    controller.enqueue(new TextEncoder().encode(payload + '\n'));
                };

                try {
                    sendEvent('thought', { content: "Initializing conversation..." });

                    // 1. Conversation ID
                    let conversationId = existingId;
                    if (!conversationId) {
                        const conv = await chatService.createConversation(undefined, message.substring(0, 30) + '...');
                        conversationId = conv.id;
                        sendEvent('init', { conversationId });
                    }

                    // 2. Save User Message
                    await chatService.addMessage(conversationId, { role: 'user', content: message });

                    // 3. Get History & Context
                    const history = await chatService.getHistory(conversationId, 6);
                    
                    const rootEntityId = process.env.ROOT_ENTITY_ID;
                    let rootContext = rootEntityId 
                        ? `The user works for the VC firm with ID: ${rootEntityId}. When they say 'us', 'we', or 'our portfolio', refer to this entity and its relationships.` 
                        : "The user works for 'Motive Partners'.";

                    if (userEntity) {
                         rootContext += `\n\nUser Context:\nName: ${userEntity.name}\nID: ${userEntity.id}\nRole: ${userEntity.business_analysis?.seniority_level || 'Employee'}\n`;
                         if (userEntity.business_analysis?.key_achievements) {
                             rootContext += `Background: ${userEntity.business_analysis.key_achievements}\n`;
                         }
                    }

                    let messages: any[] = [
                        { 
                            role: "system", 
                            content: `You are an AI analyst for a Venture Capital firm. 
                            You have access to a Knowledge Graph and Internal Notes via tools.
                            Current Date: ${new Date().toLocaleDateString()}
                            
                            ${rootContext}
                            
                            - If the user asks a question about market/companies, SEARCH the graph.
                            - For software/tools queries (e.g. "advisor tools"), broaden the query to include "AI", "WealthTech", "Modern" to find innovative solutions.
                            - EXPAND acronyms in search queries to improve recall. (e.g. "FX" -> "Foreign Exchange Currency", "AML" -> "Anti-Money Laundering", "KYC" -> "Know Your Customer", "ESG" -> "Environmental Social Governance").
                            - If asking about "risk" or "exposure", include terms like "risk management", "hedging", "compliance", "volatility" in the search query.
                            - If the user asks specifically about PEOPLE (investors, founders, experts), use 'types': ['person'] in filters to prioritize finding individuals.
                            - If the user asks about COMPANIES or PORTFOLIO, use 'types': ['organization'] and 'isPortfolio': true if they ask for 'my' or 'our' portfolio.
                            - If the user asks specifically about THEIR OWN deals (e.g. 'my deals', 'my portfolio'), use the 'get_user_deals' tool.
                            - If the user asks about internal discussions, meetings, or history with a company, use 'search_notes'.
                            - **WEB SEARCH TRIGGER**: If the user asks about "latest", "news", "regulation", "trends", or "market updates", YOU MUST USE 'perform_web_search' to get fresh data. Do not rely on internal knowledge for "latest" queries.
                            - If the user asks "Who do I know" or "Who can connect me", they mean **PEOPLE in their network**. This includes:
                                1. **Founders/CEOs** of their portfolio companies (use 'get_user_deals' then look for connected people).
                                2. **Colleagues/Partners** at their own firm (e.g. "Motive Partners") who might have the relationship.
                                3. **Advisors/Board Members** connected to them.
                            - When searching for a connection to a specific target (e.g. "J.P. Morgan"):
                                1. SEARCH for the target entity first to get its ID.
                                2. SEARCH for "Motive Partners" (or the user's firm) to find senior colleagues (Partners, IC members).
                                3. Call 'traverse_graph' on BOTH the target (inbound) and the user's firm (outbound) to find intersecting paths.
                                4. DO NOT limit "who I know" to just portfolio founders. Look for *Senior Colleagues* (e.g. Blythe Masters, Ramin Niroumand) who might have the relationship.
                            - If filtering ("show only UK"), call search with updated filters.
                            - If asking for "companies like X", first SEARCH for X to get its ID, then call 'find_similar_companies'.
                            - If asked to "explore connections" or "who is related to X", first SEARCH for X to get its ID, then call 'traverse_graph'.
                            - **VERIFY EXTERNAL KNOWLEDGE**: If you plan to list specific companies (e.g. "Sedgwick", "Gallagher", "Allianz") based on your internal knowledge, YOU MUST first call 'search_knowledge_graph' for them to verify they exist in our database and get their IDs. 
                            - **LINKING**: Use the IDs found from 'search_knowledge_graph' to create markdown links: [Name](/knowledge-graph?nodeId=ID). If a company is NOT found in the graph, mention it as text but do not fake a link.
                            
                            REASONING STRATEGY (CHAIN OF THOUGHT):
                            For "Target List" or "Event Invite" queries (e.g. "Who should I invite to a Pliant event?"):
                            1. STRATEGIZE: Do NOT just search for "Pliant". Think: Who buys this? Who partners with this?
                            2. SEGMENT: Break down the audience (e.g. "Vertical SaaS", "Spend Management Competitors", "Cross-Border Fintechs").
                            3. EXECUTE: Run 3-4 distinct 'search_knowledge_graph' calls, one for each segment.
                               - Query 1: "Vertical SaaS companies in New York"
                               - Query 2: "Spend management companies"
                               - Query 3: "Fintechs with European presence"
                            4. PEOPLE: For the top companies found, search specifically for their leaders (e.g. "Founders of [Company] in New York").
                            5. SYNTHESIZE: Group the results by segment in your final answer.

                            For complex queries (e.g. "Who can connect me to J.P. Morgan?"):
                            1. DYNAMIC QUERY EXPANSION: Break down the intent. Search for the target ("J.P. Morgan"). Search for the user's firm ("Motive Partners") to find colleagues.
                            2. PLAN: Identify the target node. Identify potential connectors (Portfolio Founders AND Senior Colleagues).
                            3. EXECUTE: Run searches and traversals in parallel.
                            4. REFLECT & CORRECT: If you find a portfolio path, THAT IS GOOD. But ALSO ask: "Are there senior partners at my firm who know this target?" (e.g. Check if Blythe Masters or other partners have a 'works_at', 'board_member', or 'contact' edge to the target).
                            5. TRAVERSE: Use 'traverse_graph' to validate specific edges.
                            6. SYNTHESIZE: Present ALL paths: "You have a path via Portfolio CEO [Name]... AND a path via Senior Partner [Name]..."
                            
                            For "Deal Context" queries (e.g. "Who looked at Company X?" or "Who knows about [Sector]?"):
                            1. SEARCH: Check 'search_notes' and 'search_knowledge_graph' for the specific company.
                            2. EXPAND: If no direct deal team is found, identify the SECTOR (e.g. "WealthTech").
                            3. FIND PROXIES: Search for OTHER portfolio or pipeline companies in that same sector.
                            4. FIND PEOPLE: Identify the Deal Team / Owners of those *similar* companies.
                            5. SYNTHESIZE: "No direct history with X, but [Partner Name] led our work on [Similar Company Y] in this space and is likely the sector lead."
                            
                            CRITICAL RULES:
                            1. STRICTLY use the company affiliations found in the knowledge graph. Do NOT hallucinate or swap similar companies (e.g. Pliant vs Pleo). If the data says "Pliant", it is Pliant.
                            2. When drafting emails to a team, look for specific 'Founders' or 'Owners' in the search results (under "People" or "Connections") and address them by name if possible.
                            3. **DRAFTING MESSAGES**: If the user asks to draft an email, SMS, or WhatsApp:
                               - **STEP 1**: SEARCH for the person to find their email/phone.
                               - **STEP 2**: SEARCH for the subject company (if applicable) to understand their business and find their URL/Domain.
                               - **STEP 3**: ANALYZE the recipient's background (if found) and synthesize WHY this subject is relevant to them.
                               - **STEP 4**: Call the 'draft_message' tool with the recipient's contact info and the message body.
                               - **MANDATORY**: The drafted message MUST include the URL of the subject company (e.g. "Check out Asseta (asseta.com)").
                               - **DO NOT** just write the message in your text response. You MUST use the tool so the user gets a clickable button.
                            
                            When answering based on search results, ALWAYS cite entities with markdown links: [Name](/knowledge-graph?nodeId=ID).` 
                        },
                        ...history.map((m: any) => ({ role: m.role, content: m.content })),
                        { role: "user", content: message }
                    ];

                    let turnCount = 0;
                    const MAX_TURNS = 6;
                    let finalReply = "";
                    
                    let finalRelevantNodeIds: string[] = [];
                    let finalExternalNodes: any[] = [];
                    let finalMessageDrafts: any[] = [];

                    sendEvent('thought', { content: "Reasoning about your request..." });

                    while (turnCount < MAX_TURNS) {
                        turnCount++;
                        
                        const currentTools = enableExternalSearch ? [...tools, webSearchTool] : tools;

                        const completion = await openai.chat.completions.create({
                            model: "gpt-5.1",
                            messages: messages as any,
                            tools: currentTools as any,
                            tool_choice: "auto"
                        });

                        const choice = completion.choices[0].message;
                        messages.push(choice);

                        if (choice.tool_calls && choice.tool_calls.length > 0) {
                            sendEvent('thought', { content: `Executing ${choice.tool_calls.length} tool(s)...` });

                            // PARALLEL EXECUTION: Map tool calls to Promises
                            const toolPromises = choice.tool_calls.map(async (toolCall) => {
                                let contextText = "";
                                let searchResults: any[] = [];
                                const args = JSON.parse(toolCall.function.arguments);
                                
                                sendEvent('tool_start', { name: toolCall.function.name, args });

                                if (toolCall.function.name === 'search_knowledge_graph') {
                                    sendEvent('thought', { content: `Searching graph for: "${args.query}"` });
                                    searchResults = await searchEntities(args.query, { limit: 30 }, args.filters || {});
                                    
                                    if (searchResults.length > 0) {
                                        const nodeIds = searchResults.map(r => r.id.toString());
                                        const names = searchResults.map(r => r.name).filter(n => n && n.length > 1);
                                        
                                        // Global ID Expansion
                                        const siblingIds = await expandIDsByName(nodeIds, names, supabase);
                                        
                                        // Return IDs to main thread for aggregation
                                        const foundIds = [...nodeIds, ...siblingIds];
                                        
                                        // Parallel fetch to enrich with connected people
                                        const enrichedContext = await Promise.all(searchResults.map(async (r, index) => {
                                            const info = r.business_analysis?.core_business || r.ai_summary || "No description.";
                                            let text = `Entity: ${r.name} (ID: ${r.id})\nType: ${r.type}\nDomain: ${r.domain || r.business_analysis?.website || r.enrichment_data?.website || ''}\nInfo: ${info}\nPortfolio: ${r.is_portfolio}\nSimilarity: ${r.similarity || 'N/A'}`;
                                            
                                            if (r.related_edges && r.related_edges.length > 0) {
                                                const edges = r.related_edges.slice(0, 5).map((e: any) => `${e.relationship} -> ${e.targetName} (${e.targetType})`).join(', ');
                                                text += `\nConnections: ${edges}`;
                                            }

                                            if (index < 5 && r.type === 'organization') {
                                                const people = await getEntityConnections(r.id, supabase);
                                                if (people) text += `\nPeople: ${people}`;
                                            }
                                            
                                            if (index < 5 && r.type === 'person') {
                                                const details = await getPersonDetails(r.id, supabase);
                                                if (details) text += `\n${details}`;
                                            }

                                            return text;
                                        }));

                                        contextText = enrichedContext.join('\n---\n');
                                        sendEvent('thought', { content: `Found ${searchResults.length} results for "${args.query}".` });
                                        return { id: toolCall.id, result: contextText, nodeIds: foundIds, draft: null };
                                    } else {
                                        contextText = "No results found. HINT: Try broadening your search terms or removing filters.";
                                        sendEvent('thought', { content: `No direct matches for "${args.query}".` });
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    }
                                } 
                                else if (toolCall.function.name === 'traverse_graph') {
                                    sendEvent('thought', { content: `Traversing graph from node ${args.startNodeId}...` });
                                    const edges = await traverseGraph(args.startNodeId, supabase, args.direction, args.relationshipType);
                                    const foundIds = [];
                                    
                                    if (edges.length > 0) {
                                        edges.forEach((e: any) => {
                                            foundIds.push(e.source);
                                            foundIds.push(e.target);
                                        });
                                        
                                        contextText = JSON.stringify(edges.map(e => ({
                                            relationship: e.kind,
                                            related_entity: e.entities?.name || e.target,
                                            related_id: e.target === args.startNodeId ? e.source : e.target
                                        })), null, 2);
                                        sendEvent('thought', { content: `Found ${edges.length} connections.` });
                                        return { id: toolCall.id, result: contextText, nodeIds: foundIds, draft: null };
                                    } else {
                                        contextText = "No related entities found with this traversal.";
                                        sendEvent('thought', { content: "Traversal returned no edges." });
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    }
                                }
                                else if (toolCall.function.name === 'get_user_deals') {
                                    sendEvent('thought', { content: "Fetching your deals/portfolio..." });
                                    if (!userEntity?.id) {
                                        contextText = "User context not found. Cannot fetch personal deals.";
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    } else {
                                        const connections = await getUserConnections(userEntity.id, supabase, undefined, args.isPortfolio);
                                        const foundIds = [];
                                        
                                        if (connections.length > 0) {
                                            const nodeIds = connections.map((c: any) => c.id);
                                            
                                            // ID Expansion for user deals too
                                            const names = connections.map((c: any) => c.name).filter((n:any) => n && n.length > 1);
                                            const siblingIds = await expandIDsByName(nodeIds, names, supabase);
                                            foundIds.push(...nodeIds, ...siblingIds);

                                            contextText = connections.map((c: any) => 
                                                `Entity: ${c.name} (ID: ${c.id})\nType: ${c.type}\nStatus: ${c.pipeline_stage}\nPortfolio: ${c.is_portfolio}\nConnection: ${c.connection_kind}`
                                            ).join('\n---\n');
                                            sendEvent('thought', { content: `Found ${connections.length} deals.` });
                                            return { id: toolCall.id, result: contextText, nodeIds: foundIds, draft: null };
                                        } else {
                                            contextText = "No connected deals found for this user.";
                                            sendEvent('thought', { content: "No deals found." });
                                            return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                        }
                                    }
                                }
                                else if (toolCall.function.name === 'find_similar_companies') {
                                    sendEvent('thought', { content: "Finding similar companies..." });
                                    searchResults = await findSimilarEntities(args.entityId, supabase);
                                    
                                    if (searchResults.length > 0) {
                                        const nodeIds = searchResults.map(r => r.id.toString());
                                        const names = searchResults.map(r => r.name).filter(n => n && n.length > 1);
                                        const siblingIds = await expandIDsByName(nodeIds, names, supabase);
                                        const foundIds = [...nodeIds, ...siblingIds];
                                        
                                        const enrichedContext = await Promise.all(searchResults.map(async (r, index) => {
                                            const info = r.business_analysis?.core_business || r.ai_summary || "No description.";
                                            let text = `Entity: ${r.name} (ID: ${r.id})\nType: ${r.type}\nInfo: ${info}\nSimilarity: ${r.similarity || 'N/A'}`;
                                            if (index < 5 && r.type === 'organization') {
                                                const people = await getEntityConnections(r.id, supabase);
                                                if (people) text += `\nPeople: ${people}`;
                                            }
                                            return text;
                                        }));
                                        contextText = enrichedContext.join('\n---\n');
                                        sendEvent('thought', { content: `Found ${searchResults.length} similar entities.` });
                                        return { id: toolCall.id, result: contextText, nodeIds: foundIds, draft: null };
                                    } else {
                                        contextText = "No similar companies found.";
                                        sendEvent('thought', { content: "No similar companies found." });
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    }
                                }
                                else if (toolCall.function.name === 'search_notes') {
                                    sendEvent('thought', { content: `Searching internal notes for: "${args.query}"` });
                                    const noteResults = await searchInteractions(args.query, supabase, args.entityId);
                                    const foundIds = [];
                                    
                                    if (noteResults.length > 0) {
                                        contextText = noteResults.map((r: any) => 
                                            `Date: ${new Date(r.occurred_at).toLocaleDateString()}\nType: ${r.type}\nSummary: ${r.summary || r.content?.substring(0, 200)}...\n`
                                        ).join('\n---\n');
                                        
                                        const noteEntityIds = noteResults.map((r: any) => r.entity_id).filter((id: any) => id);
                                        if (noteEntityIds.length > 0) {
                                             foundIds.push(...noteEntityIds);
                                        }
                                        sendEvent('thought', { content: `Found ${noteResults.length} relevant notes.` });
                                        return { id: toolCall.id, result: contextText, nodeIds: foundIds, draft: null };
                                    } else {
                                        contextText = "No matching internal notes found.";
                                        sendEvent('thought', { content: "No notes found." });
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    }
                                }
                                else if (toolCall.function.name === 'draft_message' || toolCall.function.name === 'draft_intro_email') {
                                    sendEvent('thought', { content: `Drafting ${args.channel || 'email'}...` });
                                    
                                    const draft = {
                                        channel: args.channel || 'email',
                                        recipient_name: args.recipient_name,
                                        recipient_contact: args.recipient_contact || args.recipient_email,
                                        subject: args.subject,
                                        body: args.body
                                    };
                                    
                                    contextText = `Message draft prepared (${draft.channel}). The user will see a button to open it.`;
                                    return { id: toolCall.id, result: contextText, nodeIds: [], draft: draft };
                                }
                                else if (toolCall.function.name === 'get_legal_analysis') {
                                    sendEvent('thought', { content: `Retrieving legal document analysis...` });
                                    
                                    try {
                                        // Build query parameters
                                        const params = new URLSearchParams();
                                        if (args.analysisId) params.set('id', args.analysisId);
                                        if (args.companyId) params.set('companyId', args.companyId);
                                        params.set('limit', '5');
                                        
                                        // Fetch from internal API
                                        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                                        const response = await fetch(`${baseUrl}/api/portfolio/legal-analysis?${params.toString()}`);
                                        const data = await response.json();
                                        
                                        if (!data.success) {
                                            contextText = `No legal analyses found. ${data.error || ''}`;
                                            sendEvent('thought', { content: "No legal analyses found." });
                                            return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                        }
                                        
                                        if (data.analysis) {
                                            // Single analysis requested
                                            const a = data.analysis;
                                            contextText = `Legal Analysis for: ${a.document_name}
Jurisdiction: ${a.jurisdiction}
Instrument Type: ${a.document_type}
Analyzed: ${new Date(a.created_at).toLocaleDateString()}

Executive Summary:
${(a.executive_summary || []).map((p: any) => `- [${p.flag}] ${p.point}`).join('\n')}

Flag Summary:
- Economics: ${a.flags?.economics_downside?.flag || 'N/A'}
- Control: ${a.flags?.control_governance?.flag || 'N/A'}
- Legal Risk: ${a.flags?.legal_gc_risk?.flag || 'N/A'}

View full analysis at: /portfolio/legal/analysis?id=${a.id}`;
                                        } else if (data.analyses && data.analyses.length > 0) {
                                            // List of analyses
                                            contextText = `Found ${data.analyses.length} legal document analyses:\n\n` + 
                                                data.analyses.map((a: any) => 
                                                    `- ${a.document_name} (${a.jurisdiction}, ${a.document_type.replace(/_/g, ' ')}) - ${new Date(a.created_at).toLocaleDateString()}`
                                                ).join('\n');
                                        } else {
                                            contextText = "No legal analyses found for this company.";
                                        }
                                        
                                        sendEvent('thought', { content: `Found legal analysis data.` });
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    } catch (err: any) {
                                        contextText = `Error retrieving legal analysis: ${err.message}`;
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    }
                                }
                                else if (toolCall.function.name === 'perform_web_search') {
                                    sendEvent('thought', { content: `Searching the web for: "${args.query}"` });
                                    
                                    try {
                                        const perplexityRes = await fetch('https://api.perplexity.ai/chat/completions', {
                                            method: 'POST',
                                            headers: {
                                                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                                                'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                                model: 'sonar-pro',
                                                messages: [{ role: 'user', content: args.query }]
                                            })
                                        });

                                        if (!perplexityRes.ok) {
                                            throw new Error(`Perplexity API Error: ${perplexityRes.status}`);
                                        }

                                        const data = await perplexityRes.json();
                                        const answer = data.choices?.[0]?.message?.content || "No results found.";
                                        
                                        // --- ENHANCED DATA INGESTION (Dec 2025) ---
                                        // Prioritize structured 'search_results' from Sonar Pro if available.
                                        // Fallback to raw 'citations' array if not.
                                        let richResults: any[] = data.search_results || [];
                                        
                                        if (richResults.length === 0 && data.citations && data.citations.length > 0) {
                                            // Fallback: Map plain citations to basic objects
                                            richResults = data.citations.map((url: string) => {
                                                let domain = url;
                                                try {
                                                    domain = new URL(url).hostname.replace('www.', '');
                                                } catch (e) { /* ignore */ }
                                                return { 
                                                    url, 
                                                    title: domain, // Best guess for title is domain
                                                    snippet: `Source URL: ${url}`,
                                                    date: null
                                                };
                                            });
                                        }

                                        const citations = data.citations || []; // Keep raw array for text display if needed

                                        // Create Virtual Nodes from Rich Results
                                        const newVirtualNodes = richResults.map((result: any) => {
                                            const url = result.url;
                                            let domain = url;
                                            try {
                                                domain = new URL(url).hostname.replace('www.', '');
                                            } catch (e) { /* ignore invalid urls */ }
                                            
                                            return {
                                                id: `ext-${crypto.randomUUID()}`, // Virtual ID
                                                label: result.title || domain, // Use actual title if available
                                                group: 'external', // SPECIAL GROUP
                                                properties: {
                                                    description: result.snippet || `Source for: ${args.query}`,
                                                    url: url,
                                                    date: result.date || null, // "published_date" or similar
                                                    ai_summary: `External Source: ${result.title || domain}`,
                                                    is_portfolio: false,
                                                    source_domain: domain
                                                }
                                            };
                                        });

                                        finalExternalNodes.push(...newVirtualNodes);
                                        
                                        contextText = `WEB SEARCH RESULTS:\n${answer}\n\nSOURCES:\n${richResults.map((r: any) => `- [${r.title}](${r.url})`).join('\n')}`;
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    } catch (e: any) {
                                        console.error("Web Search Error:", e);
                                        contextText = `Web search failed: ${e.message}`;
                                        return { id: toolCall.id, result: contextText, nodeIds: [], draft: null };
                                    }
                                }
                                
                                return { id: toolCall.id, result: "Unknown tool", nodeIds: [], draft: null };
                            });

                            // WAIT FOR ALL TOOLS
                            const results = await Promise.all(toolPromises);

                            // Process Results
                            results.forEach(res => {
                                if (res.nodeIds.length > 0) {
                                    finalRelevantNodeIds = [...new Set([...finalRelevantNodeIds, ...res.nodeIds])];
                                }
                                if (res.draft) {
                                    finalMessageDrafts.push(res.draft);
                                }
                                
                                messages.push({
                                    role: "tool",
                                    tool_call_id: res.id,
                                    content: JSON.stringify({ count: res.nodeIds.length, results: res.result }) 
                                });
                            });
                            
                        } else {
                            finalReply = choice.content || "I wasn't able to generate a text response, but I found some relevant data.";
                            break;
                        }
                    }

                    if (!finalReply && turnCount >= MAX_TURNS) {
                        finalReply = "I gathered the data but reached my processing limit before I could summarize it. Please check the graph visualization for the results.";
                    }

                    // Fallback: Extract cited entities
                    if (finalRelevantNodeIds.length === 0) {
                        const regex = /nodeId=([a-f0-9\-]+)/g;
                        let match;
                        while ((match = regex.exec(finalReply)) !== null) {
                            finalRelevantNodeIds.push(match[1]);
                        }
                        finalRelevantNodeIds = [...new Set(finalRelevantNodeIds)];
                    }

                    // Fetch final subgraph based on ALL accumulated nodes
                    let finalSubgraph: { nodes: any[], edges: any[] } | null = null;
                    if (finalRelevantNodeIds.length > 0) {
                        sendEvent('thought', { content: "Visualizing graph network..." });
                        finalSubgraph = await fetchSubgraph(finalRelevantNodeIds, supabase);
                    }

                    // MERGE: Add external nodes to the graph payload
                    if (finalExternalNodes.length > 0) {
                        if (!finalSubgraph) finalSubgraph = { nodes: [], edges: [] };
                        finalSubgraph.nodes = [...finalSubgraph.nodes, ...finalExternalNodes];
                    }

                    // Save Assistant Message
                    await chatService.addMessage(conversationId, { 
                        role: 'assistant', 
                        content: finalReply,
                        relevant_node_ids: finalRelevantNodeIds
                    });

                    // Final Response Payload
                    sendEvent('final', {
                        conversationId,
                        reply: finalReply,
                        relevantNodeIds: finalRelevantNodeIds,
                        subgraph: finalSubgraph,
                        messageDrafts: finalMessageDrafts
                    });

                } catch (e: any) {
                    console.error(e);
                    sendEvent('error', { message: e.message });
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
