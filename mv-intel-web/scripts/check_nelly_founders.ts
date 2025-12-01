import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkNellyFounders() {
    console.log('--- Checking Nelly Founders ---');
    const { data: nelly } = await supabase
        .schema('graph')
        .from('entities')
        .select('id')
        .ilike('name', 'Nelly')
        .eq('type', 'organization')
        .single();

    if (!nelly) {
        console.log('Nelly not found');
        return;
    }

    const { data: edges } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, kind')
        .eq('target', nelly.id)
        .eq('kind', 'founder');

    if (edges && edges.length > 0) {
        const founderIds = edges.map(e => e.source);
        const { data: founders } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name')
            .in('id', founderIds);
            
        console.log('Founders:', founders?.map(f => f.name));
    } else {
        console.log('No founders found with explicit "founder" edge.');
    }
}

checkNellyFounders();

