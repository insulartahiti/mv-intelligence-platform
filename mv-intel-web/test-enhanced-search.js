#!/usr/bin/env node

// Test enhanced semantic search with filters
async function testEnhancedSearch() {
    console.log('🧪 Testing Enhanced Semantic Search with Filters...\n');

    const tests = [
        {
            name: 'Basic wealthtech search',
            query: 'wealthtech companies',
            limit: 3
        },
        {
            name: 'Wealthtech in United States',
            query: 'wealthtech companies',
            limit: 3,
            filters: {
                countries: ['United States']
            }
        },
        {
            name: 'Companies updated in last 6 months',
            query: 'fintech payment',
            limit: 3,
            filters: {
                dateRange: {
                    start: '2024-05-25', // 6 months ago
                    end: '2024-11-25'
                }
            }
        },
        {
            name: 'Organizations (not people)',
            query: 'AI startups',
            limit: 3,
            filters: {
                types: ['organization']
            }
        }
    ];

    for (const test of tests) {
        console.log(`\n📝 Test: ${test.name}`);
        console.log(`   Query: "${test.query}"`);
        if (test.filters) {
            console.log(`   Filters:`, JSON.stringify(test.filters, null, 2));
        }

        try {
            const response = await fetch('http://localhost:3000/api/semantic-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(test)
            });

            const data = await response.json();

            if (data.success) {
                console.log(`   ✅ Found ${data.total} results:`);
                data.results.forEach((result, i) => {
                    console.log(`     ${i + 1}. ${result.name} (${result.type})`);
                    console.log(`        Similarity: ${(result.similarity * 100).toFixed(1)}%`);
                    if (result.location_country) {
                        console.log(`        Location: ${result.location_city || ''}${result.location_city && result.location_country ? ', ' : ''}${result.location_country || ''}`);
                    }
                    if (result.updated_at) {
                        console.log(`        Updated: ${new Date(result.updated_at).toLocaleDateString()}`);
                    }
                });
            } else {
                console.error(`   ❌ Search failed: ${data.message}`);
            }
        } catch (error) {
            console.error(`   ❌ Request failed: ${error.message}`);
        }
    }
}

testEnhancedSearch();
