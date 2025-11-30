import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkNavro() {
    const navroId = '66d8194a-20c0-dea9-e40e-82b2722dcfcc';
    console.log(`Checking edges for Navro: ${navroId}`);
    
    const { data: edges, error } = await supabase
        .schema('graph')
        .from('edges')
        .select('*')
        .or(`source.eq.${navroId},target.eq.${navroId}`);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${edges.length} edges.`);
        console.log(edges);
    }
}

checkNavro();

