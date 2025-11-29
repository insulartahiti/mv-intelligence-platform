import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { SearchFilters } from './postgres-vector';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Interface for Chat Message
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 2000,
    });
    return response.data[0].embedding;
}

export async function generateMarketInsight(
    query: string, 
    filters: SearchFilters = {}, 
    history: ChatMessage[] = []
) {
    console.log('🧠 Generating Conversational Insight...');

    // 1. Contextualize Query (if history exists)
    let effectiveQuery = query;
    if (history.length > 0) {
        // Use LLM to resolve references (e.g. "which of them..." -> "which of the wealth companies...")
        const contextCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Rewrite the user's last question to be standalone, resolving any pronouns like 'them' or 'it' based on the chat history." },
                ...history.slice(-4), // Keep last few turns
                { role: "user", content: query }
            ]
        });
        effectiveQuery = contextCompletion.choices[0].message.content || query;
        console.log(`   ↳ Rewritten Query: "${effectiveQuery}"`);
    }

    // 2. Vector Search with Rewritten Query
    const queryEmbedding = await generateEmbedding(effectiveQuery);
    
    const filterJson: any = { ...filters };
    if (!filterJson.queryText) filterJson.queryText = effectiveQuery;
    if (filters.dateRange?.start) filterJson.dateStart = filters.dateRange.start;
    if (filters.dateRange?.end) filterJson.dateEnd = filters.dateRange.end;

    // Infer portfolio intent from history or query
    if (effectiveQuery.toLowerCase().includes('portfolio') || effectiveQuery.toLowerCase().includes('invested')) {
        filterJson.isPortfolio = true;
    }

    const { data: seedNodes, error: searchError } = await supabase.rpc('search_entities_filtered', {
        query_embedding: queryEmbedding,
        match_threshold: 0.4,
        match_count: 10,
        filters: filterJson
    });

    if (searchError || !seedNodes || seedNodes.length === 0) {
        return { answer: "I couldn't find relevant data for that follow-up." };
    }

    // 3. Graph Traversal
    const seedIds = seedNodes.map((n: any) => n.id);
    const { data: edges } = await supabase
        .schema('graph')
        .from('edges')
        .select(`
            source, kind, target,
            source_ent:source(name),
            target_ent:target(name, type, taxonomy)
        `)
        .in('source', seedIds)
        .limit(30);

    // 4. Build Knowledge Context
    let context = "Here is the relevant market data found in the Knowledge Graph:\n\n";
    seedNodes.forEach((node: any) => {
        const biz = node.business_analysis || {};
        context += `ENTITY: ${node.name} (${node.type})\n`;
        if (node.is_portfolio) context += ` - Status: PORTFOLIO COMPANY\n`;
        context += ` - Taxonomy: ${node.taxonomy}\n`;
        if (node.type === 'person') {
            context += ` - Role: ${biz.seniority_level}\n`;
        } else {
            context += ` - Business: ${biz.core_business || node.description || 'N/A'}\n`;
        }
        context += "\n";
    });

    // 5. Generate Answer
    const completion = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
            { 
                role: "system", 
                content: "You are an expert market analyst assistant. Answer the user's question using the provided Knowledge Graph context. Be conversational. Use Markdown for entity names (e.g. **Steward**)." 
            },
            ...history.slice(-4), // Pass history to model
            { role: "user", content: `Question: ${query}\n\nContext:\n${context}` }
        ],
        temperature: 0.3,
    });

    return {
        answer: completion.choices[0].message.content,
        context_nodes: seedNodes.length,
        effective_query: effectiveQuery // Return for UI debug
    };
}
