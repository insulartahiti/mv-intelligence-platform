import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function debugNavro() {
    console.log('🕵️‍♂️ Investigating Navro...');

    // 1. Find Entity
    const { data: entities } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, location_country, location_city')
        .or('name.ilike.Navro,name.ilike.Paytrix');

    if (!entities || entities.length === 0) {
        console.log('❌ Navro/Paytrix not found in database.');
        return;
    }

    const company = entities[0];
    console.log(`🏢 Found: ${company.name} (${company.location_city || 'Unknown City'}, ${company.location_country})`);

    // 2. Check ALL Edges (looking for people)
    const { data: edges } = await supabase
        .schema('graph')
        .from('edges')
        .select('kind, source, source_entity:source(name, type)')
        .eq('target', company.id);

    const peopleEdges = edges?.filter((e: any) => e.source_entity?.type === 'person');

    if (peopleEdges && peopleEdges.length > 0) {
        console.log(`\n🔗 Found ${peopleEdges.length} connected people:`);
        peopleEdges.forEach((e: any) => {
            console.log(`   - ${e.source_entity.name} (${e.kind})`);
        });
    } else {
        console.log('\n❌ No people connected via graph edges.');
    }
}

debugNavro().catch(console.error);

