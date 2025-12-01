import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkEntities() {
    console.log('--- Checking Malte Rau ---');
    const { data: malte, error: mErr } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, description, business_analysis, ai_summary, enrichment_data')
        .ilike('name', '%Malte Rau%')
        .limit(1);

    if (malte && malte.length > 0) {
        console.log('Found Malte:', malte[0].name);
        console.log('Summary:', malte[0].ai_summary);
        console.log('Business Analysis:', JSON.stringify(malte[0].business_analysis, null, 2));
        
        // Check edges for Malte
        const { data: edges } = await supabase
            .schema('graph')
            .from('edges')
            .select('source, target, kind')
            .or(`source.eq.${malte[0].id},target.eq.${malte[0].id}`);
            
        console.log('Edges:', edges);
        
        // Check if linked to Pliant or Pleo
        if (edges) {
            const targetIds = edges.map(e => e.source === malte[0].id ? e.target : e.source);
            const { data: targets } = await supabase
                .schema('graph')
                .from('entities')
                .select('id, name')
                .in('id', targetIds);
            console.log('Connected Entities:', targets?.map(t => t.name));
        }
    } else {
        console.log('Malte Rau not found.');
    }

    console.log('\n--- Checking Nelly ---');
    const { data: nelly, error: nErr } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, description, business_analysis')
        .ilike('name', 'Nelly')
        .eq('type', 'organization')
        .limit(1);

    if (nelly && nelly.length > 0) {
        console.log('Found Nelly:', nelly[0].name);
        
        // Check edges for Nelly (looking for founders)
        const { data: nEdges } = await supabase
            .schema('graph')
            .from('edges')
            .select('source, target, kind')
            .eq('target', nelly[0].id) // Typically people -> works_at -> organization
            .in('kind', ['founder', 'owner', 'works_at', 'deal_team']); // Check relevant edge kinds
            
        console.log('Inbound Edges (Potential Founders):', nEdges);

        if (nEdges && nEdges.length > 0) {
             const personIds = nEdges.map(e => e.source);
             const { data: people } = await supabase
                .schema('graph')
                .from('entities')
                .select('id, name')
                .in('id', personIds);
             console.log('People at Nelly:', people?.map(p => p.name));
        }
    } else {
        console.log('Nelly not found.');
    }
}

checkEntities();

