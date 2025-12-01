import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkHarshEdges() {
    console.log('--- Checking Harsh Govil Edges ---');
    const { data: harsh } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .ilike('name', 'Harsh Govil')
        .eq('type', 'person')
        .single();
    
    if (harsh) {
        console.log(`Found Harsh: ${harsh.name} (${harsh.id})`);
         // Check edges where Harsh is source (Harsh -> Company)
         const { data: outbound } = await supabase
            .schema('graph')
            .from('edges')
            .select('target, kind, entities!target(name, type, is_portfolio)')
            .eq('source', harsh.id);
            
        console.log(`Outbound Edges (${outbound?.length}):`);
        outbound?.forEach((e: any) => console.log(` - [${e.kind}] -> ${e.entities?.name} (${e.entities?.type}) Portfolio: ${e.entities?.is_portfolio}`));

        // Check edges where Harsh is target (Company -> Harsh) ? Usually edges are directed Source=Person -> Target=Org for 'works_at' etc?
        // Let's check both directions.
        const { data: inbound } = await supabase
            .schema('graph')
            .from('edges')
            .select('source, kind, entities!source(name, type, is_portfolio)')
            .eq('target', harsh.id);

        console.log(`Inbound Edges (${inbound?.length}):`);
        inbound?.forEach((e: any) => console.log(` - [${e.kind}] <- ${e.entities?.name} (${e.entities?.type}) Portfolio: ${e.entities?.is_portfolio}`));

    } else {
        console.log('Harsh not found.');
    }
}

checkHarshEdges();

