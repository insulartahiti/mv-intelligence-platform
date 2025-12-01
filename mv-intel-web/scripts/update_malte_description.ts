import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function updateMalte() {
    console.log('Updating Malte Rau...');
    
    const { data: maltes } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name')
        .ilike('name', '%Malte Rau%');

    if (!maltes) return;

    const newSummary = `CEO and co-founder of Pliant (NOT Pleo). Pliant provides modern corporate credit card solutions. Malte has extensive experience in B2B fintech scaling.`;

    for (const m of maltes) {
        console.log(`Updating ${m.name}...`);
        const { error: upErr } = await supabase
            .schema('graph')
            .from('entities')
            .update({ 
                ai_summary: newSummary,
                brief_description: newSummary
            })
            .eq('id', m.id);
        if (upErr) console.error(upErr);
    }
}

updateMalte();
