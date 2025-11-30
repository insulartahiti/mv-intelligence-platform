import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findMotive() {
    console.log('Searching for "Motive"...');
    
    const { data, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type')
        .ilike('name', '%Motive%')
        .limit(10);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Results:', data);
    }
}

findMotive();

