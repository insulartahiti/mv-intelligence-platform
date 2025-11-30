import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    // Dynamic import after env vars are loaded
    const { generateEmbedding } = await import('../lib/search/postgres-vector');

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const query = "European digital assets";
    console.log(`Checking similarity for: "${query}"`);

    // 1. Generate Embedding
    const embedding = await generateEmbedding(query);

    // 2. Find Marcel
    const { data: marcel } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, is_portfolio')
        .ilike('name', '%Marcel Katenhusen%')
        .single();

    if (!marcel) {
        console.error('Marcel not found.');
        return;
    }

    // 3. Get Score via RPC
    // We can filter by ID to check his specific score
    const { data: scoreResult, error } = await supabase.rpc('search_entities_filtered', {
        query_embedding: embedding,
        match_threshold: 0.0,
        match_count: 100,
        filters: { types: ['person'] }
    });

    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    const marcelScore = scoreResult.find((r: any) => r.id === marcel.id);

    if (marcelScore) {
        console.log(`Marcel (${marcel.name}) Similarity:`, marcelScore.similarity);
        console.log(`Is Portfolio (DB):`, marcel.is_portfolio);
    } else {
        console.log('Marcel not found in top 100 results even with 0.0 threshold?');
        // Maybe he didn't match the type filter or something
        console.log('Top result:', scoreResult[0]?.name, scoreResult[0]?.similarity);
    }
}

main();
