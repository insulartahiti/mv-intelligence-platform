
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import pLimit from 'p-limit';

// Load env vars from .env.local
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiApiKey) {
    console.error('Missing required environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536,
    });
    return response.data[0].embedding;
}

async function summarizeInteractions() {
    console.log('🚀 Starting Interaction Summarization (Supabase Mode)...');

    // Parse args
    const args = process.argv.slice(2);
    let limitTotal = Infinity;
    const limitIdx = args.indexOf('--limit');
    if (limitIdx !== -1 && args[limitIdx + 1]) {
        limitTotal = parseInt(args[limitIdx + 1], 10);
        console.log(`[Summarize] Running with limit: ${limitTotal}`);
    }

    try {
        // 1. Get entities that have interactions
        // Supabase doesn't support DISTINCT ON nicely in client-side SELECT usually, 
        // but we can fetch unique entity_ids via a stored procedure OR just fetch all interactions (might be too many).
        // A better approach with Supabase client: 
        // Iterate through interactions in pages, collect unique entity IDs in a Set.
        
        console.log('Fetching entities with interactions...');
        
        const entityIds = new Set<string>();
        let page = 0;
        const pageSize = 1000;
        
        // Fetch just entity_id to be efficient
        while(true) {
            const { data, error } = await supabase
                .schema('graph')
                .from('interactions')
                .select('entity_id')
                .not('entity_id', 'is', null)
                .range(page * pageSize, (page + 1) * pageSize - 1);
                
            if (error) {
                console.error('Error fetching interactions:', error);
                break;
            }
            if (!data || data.length === 0) break;
            
            data.forEach((r: any) => entityIds.add(r.entity_id));
            page++;
            if (page > 50) break; // Safety limit for now
        }

        console.log(`Found ${entityIds.size} entities with interactions.`);

        let processed = 0;
        let updated = 0;

        // Apply limit if set
        const allEntities = Array.from(entityIds);
        const entitiesToProcess = (limitTotal < Infinity) ? allEntities.slice(0, limitTotal) : allEntities;
        
        if (limitTotal < Infinity) {
            console.log(`[Summarize] Limiting processing to first ${entitiesToProcess.length} entities.`);
        }

        // Concurrency limit
        const limit = pLimit(10);

        const tasks = entitiesToProcess.map(entity_id => limit(async () => {
            try {
            processed++;
            
            // 2. Fetch recent interactions (last 20)
            const { data: interactions, error } = await supabase
                .schema('graph')
                .from('interactions')
                .select('type, subject, content_preview, summary, occurred_at')
                .eq('entity_id', entity_id)
                .order('occurred_at', { ascending: false })
                .limit(20);

                if (error) {
                    console.error(`   [Error] Failed to fetch interactions for ${entity_id}:`, error.message);
                    return;
                }

                if (!interactions || interactions.length === 0) {
                    // This is unexpected because we found this ID in the interactions table earlier
                    console.warn(`   [Warn] No interactions found for ${entity_id} despite being in index. Skipping.`);
                    return;
                }

            // 3. Construct Context
            let context = `Recent Interactions for Entity:\n`;
            interactions.forEach((int: any) => {
                const date = int.occurred_at ? new Date(int.occurred_at).toISOString().split('T')[0] : 'Unknown Date';
                context += `- [${date}] ${int.type?.toUpperCase()}: ${int.subject || 'No Subject'}\n`;
                if (int.summary) context += `  Summary: ${int.summary}\n`;
                else if (int.content_preview) context += `  Preview: ${int.content_preview}\n`;
            });

            // 4. Generate Overall Summary with GPT-5.1
            const completion = await openai.chat.completions.create({
                    model: "gpt-5.1", // Ensure this model name is correct/available to your key
                messages: [
                    { 
                        role: "system", 
                        content: "You are an executive assistant summarizing recent relationship history. detailed but concise. Focus on key themes, risks, and next steps." 
                    },
                    { role: "user", content: `Summarize the following interaction history into a single paragraph:\n\n${context}` }
                ],
                max_tokens: 300
            });

            const summary = completion.choices[0].message.content;
            
            // 5. Generate Embedding for the summary
            const embedding = await generateEmbedding(summary || "");

            // 6. Upsert into rollup table
            const { error: upsertError } = await supabase
                .schema('graph')
                .from('entity_notes_rollup')
                .upsert({
                    entity_id: entity_id,
                    latest_summary: summary,
                    notes_count: interactions.length,
                    last_updated: new Date().toISOString(),
                    embedding: embedding
                }, { onConflict: 'entity_id' });

            if (upsertError) {
                console.error(`Error upserting summary for ${entity_id}:`, upsertError);
            } else {
            console.log(`   ✅ Summarized ${entity_id} (${interactions.length} interactions)`);
            updated++;
            }
            } catch (innerErr: any) {
                console.error(`Error processing entity ${entity_id}:`, innerErr.message);
        }
        }));

        await Promise.all(tasks);

        console.log(`\n🎉 Summarization Complete: Processed ${processed}, Updated ${updated}`);

    } catch (err) {
        console.error('Error in summarization:', err);
    }
}

summarizeInteractions().catch(console.error);


