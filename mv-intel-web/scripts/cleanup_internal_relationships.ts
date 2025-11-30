import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Handle .env loading
const envPath = path.resolve(process.cwd(), 'mv-intel-web/.env.local');
dotenv.config({ path: envPath });

// Fallback if not found
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: '.env.local' });
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log('Cleaning up bad "works_at" relationships for internal people...');

    // 1. Find internal people IDs
    const { data: internalPeople } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .eq('is_internal', true);

    if (!internalPeople || internalPeople.length === 0) {
        console.log('No internal people found.');
        return;
    }

    const internalIds = internalPeople.map(p => p.id);
    console.log(`Found ${internalIds.length} internal people.`);

    // 2. Find edges where source is internal AND kind is 'works_at'
    const { data: badEdges, error } = await supabase
        .schema('graph')
        .from('edges')
        .select('id, source, target, kind')
        .in('source', internalIds)
        .eq('kind', 'works_at');

    if (error) {
        console.error('Error finding bad edges:', error);
        return;
    }

    if (!badEdges || badEdges.length === 0) {
        console.log('No bad "works_at" edges found.');
        return;
    }

    console.log(`Found ${badEdges.length} bad edges to delete.`);
    
    // Log names for verification
    for (const edge of badEdges.slice(0, 5)) {
        console.log(`- Deleting: ${edge.source} works_at ${edge.target}`);
    }

    // 3. Delete them
    const edgeIds = badEdges.map(e => e.id);
    const { error: delError } = await supabase
        .schema('graph')
        .from('edges')
        .delete()
        .in('id', edgeIds);

    if (delError) {
        console.error('Error deleting edges:', delError);
    } else {
        console.log('Successfully deleted bad edges.');
    }
}

main();

