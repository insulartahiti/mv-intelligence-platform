
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';


export async function POST(request: NextRequest) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_KEY) {
         return NextResponse.json({ success: false, message: 'Missing configuration' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const openai = new OpenAI({ apiKey: OPENAI_KEY });

    // Helper: Generate Embedding
    async function generateEmbedding(text: string): Promise<number[]> {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: text,
            dimensions: 2000,
        });
        return response.data[0].embedding;
    }

    try {
        const body = await request.json();
        const { query } = body;

        if (!query) {
            return NextResponse.json({ success: false, message: 'Query required' }, { status: 400 });
        }

        console.log('🧠 Graph RAG Request:', query);

        // 1. Vector Search (Find Seed Nodes)
        const queryEmbedding = await generateEmbedding(query);
        const { data: seedNodes, error: searchError } = await supabase.rpc('search_entities_filtered', {
            query_embedding: queryEmbedding,
            match_threshold: 0.4,
            match_count: 5, // Keep context focused
            filters: {}
        });

        if (searchError || !seedNodes || seedNodes.length === 0) {
            return NextResponse.json({ success: false, answer: "I couldn't find any relevant entities in the database." });
        }

        // 2. Graph Traversal (Expand Context)
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

        // 3. Build Context for GPT
        let context = "Here is the relevant market data found in the Knowledge Graph:\n\n";
        
        // Add Node Details
        seedNodes.forEach((node: any) => {
            const biz = node.business_analysis || {};
            context += `ENTITY: ${node.name} (${node.type})\n`;
            context += ` - Taxonomy: ${node.taxonomy}\n`;
            
            // Add rich person details
            if (node.type === 'person') {
                context += ` - Role/Seniority: ${biz.seniority_level || 'Unknown'}\n`;
                if (biz.functional_expertise && biz.functional_expertise.length > 0) {
                    context += ` - Functional Expertise: ${biz.functional_expertise.join(', ')}\n`;
                }
                if (biz.domain_expertise && biz.domain_expertise.length > 0) {
                    context += ` - Domain Expertise: ${biz.domain_expertise.join(', ')}\n`;
                }
                if (biz.key_achievements) {
                    context += ` - Summary: ${biz.key_achievements}\n`;
                }
            } else {
                // Add rich org details
                context += ` - Core Business: ${biz.core_business || node.description || 'N/A'}\n`;
                if (biz.products) {
                     // Handle both string and object formats for products
                     const prodText = typeof biz.products === 'string' ? biz.products : JSON.stringify(biz.products);
                     context += ` - Products: ${prodText.substring(0, 300)}...\n`;
                }
            }
            
            // Add Edges for this node
            const nodeEdges = edges?.filter((e: any) => e.source === node.id) || [];
            if (nodeEdges.length > 0) {
                context += ` - Relationships:\n`;
                nodeEdges.forEach((e: any) => {
                    context += `   -> ${e.kind} of ${e.target_ent?.name || 'Unknown'} (${e.target_ent?.taxonomy || 'No Taxonomy'})\n`;
                });
            }
            context += "\n";
        });

        console.log('📝 GPT Context Length:', context.length);

        // 4. Generate Answer with GPT-5.1
        const completion = await openai.chat.completions.create({
            model: "gpt-5.1", // As requested
            messages: [
                { 
                    role: "system", 
                    content: "You are an expert market analyst assistant. Answer the user's question using ONLY the provided Knowledge Graph data. Cite specific relationships (e.g. 'Company A competes with Company B'). If the data is insufficient, say so." 
                },
                { role: "user", content: `Question: ${query}\n\n${context}` }
            ],
            temperature: 0.3, // Low temp for factual accuracy
        });

        const answer = completion.choices[0].message.content;

        return NextResponse.json({
            success: true,
            answer,
            context_nodes: seedNodes.length,
            context_edges: edges?.length || 0
        });

    } catch (error: any) {
        console.error('Graph RAG Error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

