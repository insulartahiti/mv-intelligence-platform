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
    console.log('Checking is_portfolio=true entities...');

    const { data: entities } = await supabase
        .schema('graph')
        .from('entities')
        .select('name, pipeline_stage, type')
        .eq('is_portfolio', true);

    if (!entities) return;

    console.log(`Found ${entities.length} portfolio entities.`);
    entities.slice(0, 20).forEach(e => {
        console.log(`- ${e.name} (${e.type}) [Stage: ${e.pipeline_stage}]`);
    });
}

main();

