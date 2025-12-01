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
    console.log('Fixing Februar and Marcel Katenhusen...');

    // 1. Find Februar
    const { data: februar } = await supabase
        .schema('graph')
        .from('entities')
        .select('id')
        .ilike('name', '%Februar%')
        .eq('type', 'organization')
        .single();

    if (februar) {
        console.log(`Updating Februar (${februar.id}) to is_portfolio=true`);
        await supabase
            .schema('graph')
            .from('entities')
            .update({ is_portfolio: true })
            .eq('id', februar.id);

        // 2. Find Founders
        const { data: edges } = await supabase
            .schema('graph')
            .from('edges')
            .select('source')
            .eq('target', februar.id)
            .eq('kind', 'founder');
            
        if (edges && edges.length > 0) {
            const founderIds = edges.map(e => e.source);
            console.log(`Updating ${founderIds.length} founders to is_portfolio=true`);
            
            await supabase
                .schema('graph')
                .from('entities')
                .update({ is_portfolio: true })
                .in('id', founderIds);
        }
    }
}

main();

