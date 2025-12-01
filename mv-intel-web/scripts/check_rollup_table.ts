
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

async function checkTable() {
    console.log('Checking graph.entity_notes_rollup table...');
    const { data, error } = await supabase
        .schema('graph')
        .from('entity_notes_rollup')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error accessing table:', error);
    } else {
        console.log('Table access successful. Row count:', data.length);
        console.log('Sample data:', data[0]);
    }
}

checkTable();

