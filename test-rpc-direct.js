const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRPC() {
    console.log('🧪 Testing search_entities RPC directly...\n');

    // Create a dummy embedding (all zeros)
    const dummyEmbedding = new Array(2000).fill(0);

    try {
        const { data, error } = await supabase.rpc('search_entities', {
            query_embedding: dummyEmbedding,
            match_threshold: 0,
            match_count: 5
        });

        if (error) {
            console.error('❌ RPC Error:', error);
            return;
        }

        console.log(`✅ RPC Success! Found ${data?.length || 0} results`);
        if (data && data.length > 0) {
            console.log('\nFirst result:', data[0]);
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

testRPC();
