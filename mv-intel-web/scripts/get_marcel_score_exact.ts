import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const { generateEmbedding } = await import('../lib/search/postgres-vector');
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const query = "European digital assets";
    const embedding = await generateEmbedding(query);

    const { data: entities } = await supabase
        .schema('graph')
        .from('entities')
        .select('name, embedding')
        .or('name.ilike.%Marcel Katenhusen%,name.ilike.%Mark Gilbert (Zocks)%');

    if (!entities) return;

    for (const e of entities) {
        if (!e.embedding) continue;
        const vecB = JSON.parse(e.embedding);
        const dot = embedding.reduce((sum, a, i) => sum + a * vecB[i], 0);
        console.log(`${e.name}: ${dot.toFixed(4)}`);
    }
}

main();

