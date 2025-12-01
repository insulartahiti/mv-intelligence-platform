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
    console.log('Merging Asseta AI into Asseta...');

    const winnerId = 'a7e8ce64-0169-ef00-1fcf-6d0da10122fe'; // Asseta
    const loserId = 'f66b214c-ab69-471f-ad05-e12a2f7d40b8'; // Asseta AI

    // 1. Move edges (Handle conflicts if edge already exists)
    // We'll iterate and update safely
    const { data: sourceEdges } = await supabase.from('graph.edges').select('id, target, kind').eq('source', loserId);
    if (sourceEdges) {
        for (const edge of sourceEdges) {
            // Check if winner already has this edge
            const { data: existing } = await supabase.from('graph.edges').select('id').eq('source', winnerId).eq('target', edge.target).eq('kind', edge.kind).single();
            if (existing) {
                // Delete duplicate edge on loser
                await supabase.from('graph.edges').delete().eq('id', edge.id);
            } else {
                // Move edge to winner
                await supabase.from('graph.edges').update({ source: winnerId }).eq('id', edge.id);
            }
        }
    }

    const { data: targetEdges } = await supabase.from('graph.edges').select('id, source, kind').eq('target', loserId);
    if (targetEdges) {
        for (const edge of targetEdges) {
            const { data: existing } = await supabase.from('graph.edges').select('id').eq('target', winnerId).eq('source', edge.source).eq('kind', edge.kind).single();
            if (existing) {
                await supabase.from('graph.edges').delete().eq('id', edge.id);
            } else {
                await supabase.from('graph.edges').update({ target: winnerId }).eq('id', edge.id);
            }
        }
    }

    // 2. Delete loser
    const { error: delError } = await supabase.schema('graph').from('entities').delete().eq('id', loserId);
    if (delError) console.error('Error deleting loser:', delError);
    else console.log('Deleted Asseta AI.');

    // 3. Update winner to portfolio
    const { error: updateError } = await supabase.schema('graph').from('entities').update({ is_portfolio: true }).eq('id', winnerId);
    if (updateError) console.error('Error updating winner:', updateError);
    else console.log('Updated Asseta to is_portfolio=true.');
}

main();

