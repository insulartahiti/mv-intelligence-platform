import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log('Checking Marcel Katenhusen and Februar...');

    // 1. Check Marcel
    const { data: marcel } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, is_portfolio')
        .ilike('name', '%Marcel Katenhusen%')
        .single();

    console.log('Marcel:', marcel);

    // 2. Check Februar
    const { data: februar } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, is_portfolio')
        .ilike('name', '%Februar%')
        .single();

    console.log('Februar:', februar);

    if (marcel && februar) {
        // 3. Check Edges
        const { data: edges } = await supabase
            .schema('graph')
            .from('edges')
            .select('*')
            .or(`source.eq.${marcel.id},target.eq.${marcel.id}`)
            .or(`source.eq.${februar.id},target.eq.${februar.id}`);

        const relevantEdges = edges?.filter(e => 
            (e.source === marcel.id && e.target === februar.id) ||
            (e.source === februar.id && e.target === marcel.id)
        );

        console.log('Relationships:', relevantEdges);
    }
}

main();

