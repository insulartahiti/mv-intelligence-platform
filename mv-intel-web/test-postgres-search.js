#!/usr/bin/env node

// Test Postgres semantic search API
async function testSemanticSearch() {
    console.log('🧪 Testing Postgres Semantic Search API...\n');

    const queries = [
        'fintech payment companies',
        'AI healthcare startups',
        'blockchain infrastructure'
    ];

    for (const query of queries) {
        console.log(`\n📝 Query: "${query}"`);

        try {
            const response = await fetch('http://localhost:3000/api/semantic-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, limit: 5 })
            });

            const data = await response.json();

            if (data.success) {
                console.log(`✅ Found ${data.total} results:`);
                data.results.forEach((result, i) => {
                    console.log(`  ${i + 1}. ${result.name} (${result.type})`);
                    console.log(`     Similarity: ${(result.similarity * 100).toFixed(1)}%`);
                    if (result.industry) {
                        console.log(`     Industry: ${result.industry}`);
                    }
                });
            } else {
                console.error(`❌ Search failed: ${data.message}`);
            }
        } catch (error) {
            console.error(`❌ Request failed: ${error.message}`);
        }
    }
}

testSemanticSearch();
