require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testVectorSearchAPI() {
  try {
    console.log('🧪 Testing vector search API...');
    
    // Generate embedding for 'KYB compliance companies'
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'KYB compliance companies'
    });
    
    const queryEmbedding = embeddingResponse.data[0].embedding;
    console.log('Generated embedding with', queryEmbedding.length, 'dimensions');
    
    // Test the vector search function directly
    const { data: vectorResults, error: vectorError } = await supabase
      .rpc('match_entities', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 5
      });
    
    if (vectorError) {
      console.log('❌ Vector search error:', vectorError.message);
    } else {
      console.log('✅ Vector search working! Found', vectorResults?.length || 0, 'results');
      if (vectorResults && vectorResults.length > 0) {
        console.log('Vector search results:');
        vectorResults.forEach((result, i) => {
          console.log(`${i+1}. ${result.name} (${result.type}) - similarity: ${result.similarity.toFixed(4)}`);
        });
      }
    }
    
    // Now test the API endpoint
    console.log('\n🌐 Testing API endpoint...');
    const response = await fetch('http://localhost:3000/api/graph/semantic-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'KYB compliance companies',
        limit: 5
      })
    });
    
    const apiResults = await response.json();
    console.log('API returned', apiResults.results?.length || 0, 'results');
    
    if (apiResults.results && apiResults.results.length > 0) {
      console.log('API results:');
      apiResults.results.slice(0, 3).forEach((result, i) => {
        console.log(`${i+1}. ${result.name} (${result.type}) - similarity: ${result.similarity?.toFixed(4) || 'N/A'}`);
      });
    }
    
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

testVectorSearchAPI();
