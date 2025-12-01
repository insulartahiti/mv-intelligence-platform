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
    console.log('Checking Asseta entities...');

    const { data: entities, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, pipeline_stage, is_portfolio, created_at, enrichment_source')
        .ilike('name', '%Asseta%');

    if (error) {
        console.error('Error fetching entities:', error.message);
        return;
    }

    console.log(`Found ${entities.length} entities:`);
    entities.forEach(e => {
        console.log(`- [${e.id}] ${e.name} (${e.type})`);
        console.log(`  Stage: ${e.pipeline_stage}, Portfolio: ${e.is_portfolio}`);
        console.log(`  Created: ${e.created_at}, Source: ${e.enrichment_source}`);
    });
}

main();

