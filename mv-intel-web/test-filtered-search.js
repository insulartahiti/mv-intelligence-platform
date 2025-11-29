require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Simple zero vector for testing – length 2000
    const zeroVec = Array(2000).fill(0);

    const { data, error } = await supabase.rpc('search_entities_filtered', {
        query_embedding: zeroVec,
        match_threshold: 0.3,
        match_count: 5,
        filters: {
            countries: ['United States'],
            types: ['organization']
        }
    });

    if (error) {
        console.error('RPC error:', error);
    } else {
        console.log('Results:', data);
    }
})();
