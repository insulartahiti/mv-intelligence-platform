import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import pLimit from 'p-limit';

// Robust Env Loading
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../.env.local'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../../.env.local')
];

let envLoaded = false;
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        console.log(`[Embed] Loaded env from ${p}`);
        envLoaded = true;
        break;
    }
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embedInteractions() {
    console.log('[Embed] Starting interaction embedding...');
    
    // Parse args
    const args = process.argv.slice(2);
    let limitTotal = Infinity;
    const limitIdx = args.indexOf('--limit');
    if (limitIdx !== -1 && args[limitIdx + 1]) {
        limitTotal = parseInt(args[limitIdx + 1], 10);
        console.log(`[Embed] Running with limit: ${limitTotal}`);
    }

    // Process in batches
    let processed = 0;
    const BATCH_SIZE = 50;
    
    while (true) {
        if (processed >= limitTotal) {
             console.log(`[Embed] Reached limit of ${limitTotal}. Stopping.`);
             break;
        }

        // Fetch interactions without embeddings
        const { data: interactions, error } = await supabase
            .schema('graph')
            .from('interactions')
            .select('id, content_preview, subject, interaction_type')
            .is('embedding', null)
            .limit(BATCH_SIZE);

        if (error) {
            console.error('[Embed] Error fetching interactions:', error.message);
            break;
        }

        if (!interactions || interactions.length === 0) {
            console.log('[Embed] No more interactions to embed.');
            break;
        }

        console.log(`[Embed] Processing batch of ${interactions.length} interactions...`);

        const limit = pLimit(10); // Limit concurrency to avoid connection errors

        const tasks = interactions.map((note) => limit(async () => {
            // Construct text to embed
            const text = `Type: ${note.interaction_type || 'note'}\nSubject: ${note.subject || ''}\nContent: ${note.content_preview || ''}`.trim();
            
            if (!text) return;

            try {
                const response = await openai.embeddings.create({
                    model: 'text-embedding-3-large',
                    input: text,
                    dimensions: 2000
                });
                
                const embedding = response.data[0].embedding;

                await supabase
                    .schema('graph')
                    .from('interactions')
                    .update({ embedding: embedding })
                    .eq('id', note.id);
                
                processed++;
            } catch (err: any) {
                console.error(`[Embed] Failed to embed ${note.id}: ${err.message}`);
            }
        }));

        await Promise.all(tasks);

        // Small delay to respect rate limits if needed
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`[Embed] Complete. Total embedded: ${processed}`);
}

embedInteractions();
