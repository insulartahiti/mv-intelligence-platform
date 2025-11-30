import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), 'mv-intel-web/.env.local');
dotenv.config({ path: envPath });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log('Fixing is_internal flags based on relationship roles...');

    // 1. Find all unique source IDs where kind is 'owner' or 'deal_team'
    const { data: edges, error } = await supabase
        .schema('graph')
        .from('edges')
        .select('source')
        .in('kind', ['owner', 'deal_team']);

    if (error) {
        console.error('Error fetching edges:', error);
        return;
    }

    if (!edges || edges.length === 0) {
        console.log('No owner/deal_team edges found.');
        return;
    }

    const internalPersonIds = [...new Set(edges.map(e => e.source))];
    console.log(`Found ${internalPersonIds.length} people who should be internal.`);

    // 2. Update them in batches
    const batchSize = 100;
    for (let i = 0; i < internalPersonIds.length; i += batchSize) {
        const batch = internalPersonIds.slice(i, i + batchSize);
        const { error: updateError } = await supabase
            .schema('graph')
            .from('entities')
            .update({ is_internal: true })
            .in('id', batch);
        
        if (updateError) {
            console.error('Error updating batch:', updateError);
        } else {
            console.log(`Updated batch ${i/batchSize + 1}: Set is_internal=true for ${batch.length} people`);
        }
    }
    
    console.log('Done fixing flags.');
}

main();

