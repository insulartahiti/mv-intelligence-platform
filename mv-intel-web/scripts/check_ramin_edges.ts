import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkEdges() {
    console.log('--- Checking for Ramin ---');
    const { data: ramin, error: rErr } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .ilike('name', '%Ramin%') // Generic match for Ramin Niroumand or similar
        .eq('type', 'person')
        .limit(5); // Increased limit to see all Ramins

    if (rErr) console.error('Error finding Ramin:', rErr);
    if (!ramin || ramin.length === 0) {
        console.log('Ramin not found.');
    } else {
        for (const r of ramin) {
            console.log(`Found Ramin: ${r.name} (ID: ${r.id})`);
             // Check edges for Ramin
            const { data: rEdges } = await supabase
                .schema('graph')
                .from('edges')
                .select('source, target, kind, properties')
                .or(`source.eq.${r.id},target.eq.${r.id}`)
                .limit(20);
            
            console.log(`  Edges (${rEdges?.length || 0}):`);
            rEdges?.forEach(e => {
                 const otherId = e.source === r.id ? e.target : e.source;
                 console.log(`  - ${e.kind} <-> ${otherId}`);
            });
        }
    }

    console.log('\n--- Checking for Harsh Govil ---');
    const { data: harsh } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .ilike('name', 'Harsh Govil')
        .eq('type', 'person')
        .single();
    
    if (harsh) {
        console.log(`Found Harsh: ${harsh.name} (${harsh.id})`);
         // Check edges for Harsh
         const { data: hEdges } = await supabase
         .schema('graph')
         .from('edges')
         .select('source, target, kind, properties')
         .or(`source.eq.${harsh.id},target.eq.${harsh.id}`)
         .limit(20);
     
        console.log(`  Edges (${hEdges?.length || 0}):`);
        hEdges?.forEach(e => {
            const otherId = e.source === harsh.id ? e.target : e.source;
            console.log(`  - ${e.kind} <-> ${otherId}`);
       });
    } else {
        console.log('Harsh not found.');
    }
}

checkEdges();
