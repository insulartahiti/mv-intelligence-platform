
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkNeel() {
    console.log("Searching for Neel Ganu...");
    const { data: people, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .ilike('name', '%Neel Ganu%');
    
    if (error) console.error(error);
    console.log("People found:", people?.length);
    people?.forEach(p => {
        console.log(`- ${p.name} (${p.id})`);
        console.log(`  Type: ${p.type}`);
        console.log(`  Description: ${p.description}`);
        console.log(`  Summary: ${p.ai_summary}`);
        console.log(`  Enrichment:`, JSON.stringify(p.enrichment_data, null, 2));
        console.log(`  Analysis:`, JSON.stringify(p.business_analysis, null, 2));
    });

    console.log("\nSearching for Pluto...");
    const { data: companies } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .ilike('name', '%Pluto%');
        
    companies?.forEach(c => {
        console.log(`- ${c.name} (${c.id})`);
        console.log(`  Type: ${c.type}`);
        console.log(`  Description: ${c.description}`);
    });
    
    if (people?.length > 0) {
        const neel = people[0];
        console.log("\nChecking edges for Neel...");
        const { data: edges } = await supabase
            .schema('graph')
            .from('edges')
            .select('source, target, kind, entities!target(name, type)')
            .eq('source', neel.id);
            
        edges?.forEach(e => {
            console.log(`  -> ${e.kind} -> ${e.entities?.name} (${e.target})`);
        });
        
        const { data: inEdges } = await supabase
            .schema('graph')
            .from('edges')
            .select('source, target, kind, entities!source(name, type)')
            .eq('target', neel.id);
            
        inEdges?.forEach(e => {
            console.log(`  <- ${e.kind} <- ${e.entities?.name} (${e.source})`);
        });
    }
}

checkNeel();

