import { NextRequest, NextResponse } from 'next/server';
import { ChatService } from '@/lib/chat/service';
import { searchEntities } from '@/lib/search/postgres-vector';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const chatService = new ChatService();
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to fetch subgraph - using parallel queries for robustness
async function fetchSubgraph(nodeIds: string[]) {
    if (nodeIds.length === 0) return { nodes: [], edges: [] };

    // 1. Fetch Nodes (Rich Data)
    const { data: nodes } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, industry, importance, is_portfolio, is_pipeline, business_analysis, ai_summary, description, location_country')
        .in('id', nodeIds);

    // 2. Fetch Edges (Split into two queries to avoid .or() issues)
    console.log(`FetchSubgraph: Getting edges for ${nodeIds.length} nodes...`);

    const { data: edgesAsSource, error: sourceError } = await supabase
        .schema('graph')
        .from('edges')
        .select('id, source, target, kind')
        .in('source', nodeIds)
        .limit(100);

    if (sourceError) console.error('Error fetching edgesAsSource:', sourceError);

    const { data: edgesAsTarget, error: targetError } = await supabase
        .schema('graph')
        .from('edges')
        .select('id, source, target, kind')
        .in('target', nodeIds)
        .limit(100);

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
            .limit(30); // Limit secondary nodes
        
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

    return {
        nodes: allNodes.map((n: any) => ({
            id: n.id,
            label: n.name,
            group: n.type,
            properties: n
        })),
        edges: allEdges.map((e: any) => ({
            id: e.id,
            from: e.source,
            to: e.target,
            label: e.kind,
            properties: e
        }))
    };
}

// Helper for Similarity Search (Companies)
async function findSimilarEntities(entityId: string) {
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
        match_count: 10,
        filters: { type: 'organization' }
    });
    
    if (error) console.error('Similarity search error:', error);
    return results || [];
}

// Helper for Notes Search
async function searchInteractions(query: string, entityId?: string) {
    try {
        // Generate embedding
        const embeddingResponse = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).embeddings.create({
            model: 'text-embedding-3-large',
            input: query,
            dimensions: 2000
        });
        const embedding = embeddingResponse.data[0].embedding;

        // Call RPC
        const { data, error } = await supabase.rpc('search_interactions', {
            query_embedding: embedding,
            match_threshold: 0.5, // Lower threshold for notes
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

// OpenAI Tool Definitions
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
              seniority: { type: "array", items: { type: "string" } }
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
          entityId: { type: "string", description: "Optional UUID of the company/person to filter notes by. Use this if the user asks about a specific entity." }
        },
        required: ["query"]
      }
    }
  }
];

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message, conversationId: existingId } = body;

        // 1. Conversation ID
        let conversationId = existingId;
        if (!conversationId) {
            const conv = await chatService.createConversation(undefined, message.substring(0, 30) + '...');
            conversationId = conv.id;
        }

        // 2. Save User Message
        await chatService.addMessage(conversationId, { role: 'user', content: message });

        // 3. Get History & Context
        const history = await chatService.getHistory(conversationId, 6);
        
        const rootEntityId = process.env.ROOT_ENTITY_ID;
        const rootContext = rootEntityId 
            ? `The user works for the VC firm with ID: ${rootEntityId}. When they say 'us', 'we', or 'our portfolio', refer to this entity and its relationships.` 
            : "The user works for 'Motive Partners'.";

        let messages = [
            { 
                role: "system", 
                content: `You are an AI analyst for a Venture Capital firm. 
                You have access to a Knowledge Graph and Internal Notes via tools.
                
                ${rootContext}
                
                - If the user asks a question about market/companies, SEARCH the graph.
                - If the user asks about internal discussions, meetings, or history with a company, use 'search_notes'.
                - If filtering ("show only UK"), call search with updated filters.
                - If asking for "companies like X", first SEARCH for X to get its ID, then call 'find_similar_companies'.
                
                When answering based on search results, ALWAYS cite entities with markdown links: [Name](/knowledge-graph?nodeId=ID).` 
            },
            ...history.map((m: any) => ({ role: m.role, content: m.content })),
            { role: "user", content: message }
        ];

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        let turnCount = 0;
        const MAX_TURNS = 5;
        let finalReply = "";
        
        // Accumulate results from all steps to show in graph
        let finalRelevantNodeIds: string[] = [];
        let finalSubgraph = null;

        while (turnCount < MAX_TURNS) {
            turnCount++;
            
            const completion = await openai.chat.completions.create({
                model: "gpt-5.1",
                messages: messages as any,
                tools: tools as any,
                tool_choice: "auto"
            });

            const choice = completion.choices[0].message;
            messages.push(choice); // Add assistant message (potentially with tool calls)

            if (choice.tool_calls && choice.tool_calls.length > 0) {
                const toolCall = choice.tool_calls[0]; // Handle one tool per turn for simplicity
                let contextText = "";
                let searchResults: any[] = [];

                if (toolCall.function.name === 'search_knowledge_graph') {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log('🔍 Tool Call: search_knowledge_graph', args);
                    searchResults = await searchEntities(args.query, { limit: 10 }, args.filters || {});
                    
                    if (searchResults.length > 0) {
                        const nodeIds = searchResults.map(r => r.id.toString());
                        finalRelevantNodeIds = [...new Set([...finalRelevantNodeIds, ...nodeIds])];
                        
                        contextText = searchResults.map(r => {
                            const info = r.business_analysis?.core_business || r.ai_summary || "No description.";
                            return `Entity: ${r.name} (ID: ${r.id})\nType: ${r.type}\nInfo: ${info}\nPortfolio: ${r.is_portfolio}\nSimilarity: ${r.similarity || 'N/A'}\n`;
                        }).join('\n---\n');
                    } else {
                        contextText = "No results found.";
                    }
                } 
                else if (toolCall.function.name === 'find_similar_companies') {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log('🔍 Tool Call: find_similar_companies', args);
                    searchResults = await findSimilarEntities(args.entityId);
                    
                    if (searchResults.length > 0) {
                        const nodeIds = searchResults.map(r => r.id.toString());
                        finalRelevantNodeIds = [...new Set([...finalRelevantNodeIds, ...nodeIds])];
                        
                        contextText = searchResults.map(r => {
                            const info = r.business_analysis?.core_business || r.ai_summary || "No description.";
                            return `Entity: ${r.name} (ID: ${r.id})\nType: ${r.type}\nInfo: ${info}\nSimilarity: ${r.similarity || 'N/A'}\n`;
                        }).join('\n---\n');
                    } else {
                        contextText = "No similar companies found.";
                    }
                }
                else if (toolCall.function.name === 'search_notes') {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log('🔍 Tool Call: search_notes', args);
                    const noteResults = await searchInteractions(args.query, args.entityId);
                    
                    if (noteResults.length > 0) {
                        contextText = noteResults.map((r: any) => 
                            `Date: ${new Date(r.occurred_at).toLocaleDateString()}\nType: ${r.type}\nSummary: ${r.summary || r.content?.substring(0, 200)}...\n`
                        ).join('\n---\n');
                        
                        // If note has entity_id, add to graph?
                        const noteEntityIds = noteResults.map((r: any) => r.entity_id).filter((id: any) => id);
                        if (noteEntityIds.length > 0) {
                             finalRelevantNodeIds = [...new Set([...finalRelevantNodeIds, ...noteEntityIds])];
                        }
                    } else {
                        contextText = "No matching internal notes found.";
                    }
                }

                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ count: searchResults.length, results: contextText }) 
                });
                
            } else {
                finalReply = choice.content || "I couldn't process that.";
                break;
            }
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
        if (finalRelevantNodeIds.length > 0) {
            finalSubgraph = await fetchSubgraph(finalRelevantNodeIds);
        }

        // 7. Save Assistant Message
        await chatService.addMessage(conversationId, { 
            role: 'assistant', 
            content: finalReply,
            relevant_node_ids: finalRelevantNodeIds
        });

        return NextResponse.json({
            conversationId,
            reply: finalReply,
            relevantNodeIds: finalRelevantNodeIds,
            subgraph: finalSubgraph
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
