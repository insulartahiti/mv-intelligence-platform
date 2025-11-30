// Simple test that calls RPC directly with filters
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testWithFilters() {
    console.log('🧪 Testing search_entities with filters...\n');

    // Create a real embedding for "payment"
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const embeddingResponse = await openai.embeddings.create({
        input: 'payment gateway companies',
        model: 'text-embedding-3-large',
        dimensions: 2000
    });

    const embedding = embeddingResponse.data[0].embedding;

    console.log('✅ Generated embedding for query\n');

    // Test 1: No filters
    console.log('Test 1: No filters');
    const { data: results1, error: error1 } = await supabase.rpc('search_entities', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 3
    });

    if (error1) console.error('Error:', error1);
    else console.log(`Found ${results1.length} results:`, results1.map(r => r.name).join(', '));

    // Test 2: With country filter
    console.log('\nTest 2: Filter by United States');
    const { data: results2, error: error2 } = await supabase.rpc('search_entities', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 3,
        filter_countries: ['United States']
    });

    if (error2) console.error('Error:', error2);
    else console.log(`Found ${results2.length} results:`, results2.map(r => `${r.name} (${r.location_country})`).join(', '));

    // Test 3: With type filter
    console.log('\nTest 3: Filter by organization type');
    const { data: results3, error: error3 } = await supabase.rpc('search_entities', {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 3,
        filter_types: ['organization']
    });

    if (error3) console.error('Error:', error3);
    else console.log(`Found ${results3.length} results:`, results3.map(r => `${r.name} (${r.type})`).join(', '));
}

testWithFilters();
