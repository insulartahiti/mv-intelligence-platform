import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPortfolio() {
    console.log('--- Checking Portfolio Entities ---');
    
    const { count, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('*', { count: 'exact', head: true })
        .eq('is_portfolio', true)
        .eq('type', 'organization');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Total Portfolio Organizations: ${count}`);
    }

    // Sample a few
    const { data: samples } = await supabase
        .schema('graph')
        .from('entities')
        .select('name, pipeline_stage, is_portfolio')
        .eq('is_portfolio', true)
        .eq('type', 'organization')
        .limit(10);
        
    console.log('Sample Portfolio Companies:', samples);
}

checkPortfolio();

