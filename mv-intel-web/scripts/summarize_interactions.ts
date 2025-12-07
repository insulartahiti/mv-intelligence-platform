
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
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 2000,
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
        // 1. Get entities that have NEW interactions since their last summary
        // We do this by joining interactions with entity_notes_rollup
        console.log('Fetching entities with new interactions...');
        
        // First, get the latest interaction date for each entity
        // Since Supabase API doesn't support complex group by/having easily in JS client,
        // we'll use a two-step approach or a raw query if possible. 
        // But for simplicity and robustness in this client context:
        // We will iterate entities in the rollup table and checking if they are stale, 
        // PLUS we need to catch new entities that aren't in the rollup table yet.
        
        // BETTER APPROACH:
        // 1. Fetch all unique entity_ids from interactions (4220) - fast enough
        // 2. Fetch all (entity_id, last_updated) from entity_notes_rollup
        // 3. Filter in memory (or ideally, if we could write a stored procedure, that would be best).
        // Given the 4k scale, in-memory diff is fine.

        const [interactionsResult, rollupResult] = await Promise.all([
            // Fetch all unique entity_ids from interactions (simulating DISTINCT)
             supabase.rpc('get_distinct_interaction_entities'), // Assuming RPC exists, if not fallback to paginated fetch
             supabase.schema('graph').from('entity_notes_rollup').select('entity_id, last_updated')
        ]);

        // If RPC doesn't exist, we use the pagination method we had, but let's optimize it to just be a set of IDs
        let distinctEntityIds = new Set<string>();
        
        if (interactionsResult.error) {
            // Fallback to pagination if RPC fails or doesn't exist
            let page = 0;
            const pageSize = 1000;
            while(true) {
                const { data, error } = await supabase
                    .schema('graph')
                    .from('interactions')
                    .select('entity_id, created_at') // Get created_at to check freshness
                    .not('entity_id', 'is', null)
                    .order('created_at', { ascending: false }) // optimize to get latest first? No, we need all ID's or max date.
                    // actually, without a group by, we fetch all rows. That's 50k+ rows maybe.
                    // Optimization: Just select entity_id.
                    .range(page * pageSize, (page + 1) * pageSize - 1);
                    
                if (error) break;
                if (!data || data.length === 0) break;
                
                data.forEach((r: any) => distinctEntityIds.add(r.entity_id));
                page++;
                if (page > 100) break; 
            }
        } else {
            // Using RPC result if implemented
             (interactionsResult.data as any[])?.forEach((r: any) => distinctEntityIds.add(r.entity_id));
        }
        
        // Create map of existing summaries
        const existingSummaries = new Map<string, string>(); // ID -> last_updated
        if (rollupResult.data) {
            rollupResult.data.forEach((r: any) => existingSummaries.set(r.entity_id, r.last_updated));
        }

        const entitiesToProcess: string[] = [];
        const forceUpdate = args.includes('--force');

        if (forceUpdate) {
            console.log('⚠️ --force flag detected: Re-summarizing ALL entities.');
            entitiesToProcess.push(...Array.from(distinctEntityIds));
        } else {
            // Filter: Process if NEW (not in rollup) or STALE (interaction > last_summary)
            // Note: Checking "interaction > last_summary" strictly requires fetching the max interaction date for every entity.
            // That is expensive (N queries).
            // COMPROMISE: We will fetch the MAX(created_at) for each entity in a single query if possible.
            // Since we can't easily, we will use a heuristic or just accept that we need to check readiness inside the loop.
            //
            // OPTIMIZED LOGIC: 
            // We will rely on the loop. Inside the loop, we fetch the latest interaction.
            // If latest_interaction.created_at < existing_summary.last_updated, we SKIP.
            
            // So here, we just put ALL IDs in the list, but inside the concurrency limit, 
            // we perform the "Stale Check" FIRST before generating AI.
            entitiesToProcess.push(...Array.from(distinctEntityIds));
        }

        console.log(`Found ${entitiesToProcess.length} candidates. Checking for staleness...`);

        // Concurrency limit
        const limit = pLimit(10);

        const tasks = entitiesToProcess.map(entity_id => limit(async () => {
            try {
            
            // STALENESS CHECK (Optimization)
            // Fetch only the MOST RECENT interaction timestamp first
            const { data: latestInt } = await supabase
                .schema('graph')
                .from('interactions')
                .select('created_at')
                .eq('entity_id', entity_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            const lastSummaryTime = existingSummaries.get(entity_id);
            
            if (!forceUpdate && latestInt && lastSummaryTime) {
                const latestInteractionDate = new Date(latestInt.created_at);
                const summaryDate = new Date(lastSummaryTime);
                
                // If the summary is newer than the latest interaction, SKIP AI
                if (summaryDate > latestInteractionDate) {
                    // console.log(`   ⏭️ Skipping ${entity_id} (Up to date)`);
                    return;
                }
            }

            processed++;
            
            // 2. Fetch recent interactions (last 20)
            const { data: interactions, error } = await supabase
                .schema('graph')
                .from('interactions')
                .select('interaction_type, subject, content_preview, ai_summary, created_at')
                .eq('entity_id', entity_id)
                .order('created_at', { ascending: false })
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
                const date = int.created_at ? new Date(int.created_at).toISOString().split('T')[0] : 'Unknown Date';
                context += `- [${date}] ${int.interaction_type?.toUpperCase()}: ${int.subject || 'No Subject'}\n`;
                if (int.ai_summary) context += `  Summary: ${int.ai_summary}\n`;
                else if (int.content_preview) context += `  Preview: ${int.content_preview}\n`;
            });

            // 4. Generate Overall Summary with GPT-5.1
            const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini", // Optimized for cost
                messages: [
                    { 
                        role: "system", 
                        content: "You are an executive assistant summarizing recent relationship history. detailed but concise. Focus on key themes, risks, and next steps." 
                    },
                    { role: "user", content: `Summarize the following interaction history into a single paragraph:\n\n${context}` }
                ],
                max_completion_tokens: 300
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


