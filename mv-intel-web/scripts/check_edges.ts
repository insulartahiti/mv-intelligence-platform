import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkEdges() {
    console.log('Checking edges...');
    
    // Total count
    const { count, error } = await supabase
        .schema('graph')
        .from('edges')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error counting edges:', error);
    } else {
        console.log(`Total edges in DB: ${count}`);
    }

    // Sample edges
    const { data: sample } = await supabase
        .schema('graph')
        .from('edges')
        .select('*')
        .limit(5);
        
    console.log('Sample edges:', sample);
    
    // Check specific query used in fetchSubgraph
    // .or(`source.in.(${nodeIds.join(',')}),target.in.(${nodeIds.join(',')})`)
    // We'll simulate with a sample ID if we found one
    if (sample && sample.length > 0) {
        const testId = sample[0].source;
        console.log(`Testing fetch for source: ${testId}`);
        const { data: testResult, error: testError } = await supabase
            .schema('graph')
            .from('edges')
            .select('*')
            .or(`source.eq.${testId},target.eq.${testId}`); // Simple OR check
            
        if (testError) console.error(testError);
        console.log(`Found ${testResult?.length} edges for test ID.`);
    }
}

checkEdges();

