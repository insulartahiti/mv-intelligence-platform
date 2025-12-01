
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkState() {
    console.log('Checking graph.sync_state table...');
    const { data, error } = await supabase
        .schema('graph')
        .from('sync_state')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error accessing table:', error);
    } else {
        console.log('Latest Sync State:', JSON.stringify(data[0], null, 2));
    }
}

checkState();

