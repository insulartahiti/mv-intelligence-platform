import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkUser() {
    console.log('Checking for Harsh Govil...');
    const { data, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .ilike('name', 'Harsh Govil')
        .eq('type', 'person');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found:', data);
    }
}

checkUser();

