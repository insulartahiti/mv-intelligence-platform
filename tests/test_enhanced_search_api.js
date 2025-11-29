// Enhanced Search API Tests
// Test the enhanced semantic search API endpoints

const fetch = require('node-fetch');

const API_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost') 
  ? 'http://localhost:3000' 
  : 'https://your-domain.com';

const testQueries = [
  {
    name: 'Basic Entity Search',
    query: 'fintech companies',
    expectedTypes: ['organization'],
    minResults: 1
  },
  {
    name: 'Person Search',
    query: 'investors in AI',
    expectedTypes: ['person'],
    minResults: 1
  },
  {
    name: 'Introduction Path Query',
    query: 'who can connect me to John Doe',
    expectedTypes: ['person'],
    minResults: 0 // Might not find John Doe
  },
  {
    name: 'Similarity Search',
    query: 'companies similar to Stripe',
    expectedTypes: ['organization'],
    minResults: 1
  },
  {
    name: 'Competitive Analysis',
    query: 'competitors of Square',
    expectedTypes: ['organization'],
    minResults: 1
  }
];

async function testEnhancedSearchAPI() {
  console.log('🔍 Testing Enhanced Search API...\n');
  
  let passed = 0;
  let failed = 0;
  const results = [];
  
  for (const test of testQueries) {
    try {
      console.log(`Testing: ${test.name}`);
      console.log(`Query: "${test.query}"`);
      
      const startTime = Date.now();
      
      // Test the enhanced search API
      const response = await fetch(`${API_BASE}/api/graph/enhanced-semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: test.query,
          limit: 10
        })
      });
      
      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Validate response structure
      if (!data.success) {
        throw new Error(`API returned success: false - ${data.message}`);
      }
      
      if (!Array.isArray(data.results)) {
        throw new Error('Results is not an array');
      }
      
      if (data.results.length < test.minResults) {
        throw new Error(`Expected at least ${test.minResults} results, got ${data.results.length}`);
      }
      
      // Validate result structure
      const firstResult = data.results[0];
      if (!firstResult.id || !firstResult.name || !firstResult.type) {
        throw new Error('Invalid result structure - missing required fields');
      }
      
      // Check if results match expected types
      if (test.expectedTypes && test.expectedTypes.length > 0) {
        const hasExpectedType = data.results.some(r => test.expectedTypes.includes(r.type));
        if (!hasExpectedType) {
          console.log(`⚠️  Warning: No results of expected types ${test.expectedTypes.join(', ')}`);
        }
      }
      
      console.log(`✅ ${test.name} - ${data.results.length} results in ${duration}ms`);
      console.log(`   Top result: ${firstResult.name} (${firstResult.type})`);
      if (firstResult.finalScore) {
        console.log(`   Score: ${firstResult.finalScore.toFixed(3)}`);
      }
      console.log('');
      
      results.push({
        name: test.name,
        query: test.query,
        status: 'PASSED',
        duration,
        resultCount: data.results.length,
        topResult: firstResult.name,
        topType: firstResult.type,
        score: firstResult.finalScore
      });
      
      passed++;
      
    } catch (error) {
      console.log(`❌ ${test.name} - ${error.message}`);
      console.log('');
      
      results.push({
        name: test.name,
        query: test.query,
        status: 'FAILED',
        duration: 0,
        error: error.message
      });
      
      failed++;
    }
  }
  
  // Test API with different parameters
  await testSearchParameters();
  
  // Print summary
  console.log('=' * 60);
  console.log('📊 ENHANCED SEARCH API TEST SUMMARY');
  console.log('=' * 60);
  console.log(`Total Tests: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => r.status === 'FAILED').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n🎯 DETAILED RESULTS:');
  results.forEach(r => {
    if (r.status === 'PASSED') {
      console.log(`  ✅ ${r.name}: ${r.resultCount} results in ${r.duration}ms`);
    } else {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
  });
  
  return { passed, failed, results };
}

async function testSearchParameters() {
  console.log('🔍 Testing Search Parameters...\n');
  
  const testCases = [
    {
      name: 'With Filters',
      params: {
        query: 'fintech',
        filters: {
          entityTypes: ['organization'],
          industries: ['fintech']
        },
        limit: 5
      }
    },
    {
      name: 'With User Role',
      params: {
        query: 'AI startups',
        userRole: 'investor',
        limit: 3
      }
    },
    {
      name: 'With High Limit',
      params: {
        query: 'technology',
        limit: 20
      }
    }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.name}`);
      
      const response = await fetch(`${API_BASE}/api/graph/enhanced-semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCase.params)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`API error: ${data.message}`);
      }
      
      console.log(`✅ ${testCase.name} - ${data.results.length} results`);
      
    } catch (error) {
      console.log(`❌ ${testCase.name} - ${error.message}`);
    }
  }
  
  console.log('');
}

async function testGraphVisualizationAPI() {
  console.log('🔍 Testing Graph Visualization API...\n');
  
  try {
    // Test if the enhanced visualization component exists
    const response = await fetch(`${API_BASE}/api/graph/semantic-search`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Graph visualization API accessible');
      console.log(`   Sample results: ${data.results?.length || 0} entities`);
    } else {
      console.log('⚠️  Graph visualization API not accessible');
    }
    
  } catch (error) {
    console.log(`❌ Graph visualization API test failed: ${error.message}`);
  }
  
  console.log('');
}

// Performance test
async function testSearchPerformance() {
  console.log('🔍 Testing Search Performance...\n');
  
  const queries = [
    'fintech companies',
    'AI investors',
    'startup founders',
    'venture capital',
    'technology startups'
  ];
  
  const results = [];
  
  for (const query of queries) {
    try {
      const startTime = Date.now();
      
      const response = await fetch(`${API_BASE}/api/graph/enhanced-semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 10
        })
      });
      
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        results.push({
          query,
          duration,
          resultCount: data.results?.length || 0,
          success: true
        });
        console.log(`✅ "${query}" - ${duration}ms (${data.results?.length || 0} results)`);
      } else {
        results.push({
          query,
          duration,
          resultCount: 0,
          success: false,
          error: `HTTP ${response.status}`
        });
        console.log(`❌ "${query}" - ${duration}ms (${response.status})`);
      }
      
    } catch (error) {
      results.push({
        query,
        duration: 0,
        resultCount: 0,
        success: false,
        error: error.message
      });
      console.log(`❌ "${query}" - Error: ${error.message}`);
    }
  }
  
  // Calculate performance metrics
  const successfulResults = results.filter(r => r.success);
  const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
  const maxDuration = Math.max(...successfulResults.map(r => r.duration));
  const minDuration = Math.min(...successfulResults.map(r => r.duration));
  
  console.log('\n📊 PERFORMANCE METRICS:');
  console.log(`Average Response Time: ${avgDuration.toFixed(2)}ms`);
  console.log(`Fastest Query: ${minDuration}ms`);
  console.log(`Slowest Query: ${maxDuration}ms`);
  console.log(`Success Rate: ${(successfulResults.length / results.length * 100).toFixed(1)}%`);
  
  return results;
}

// Main test runner
async function runSearchAPITests() {
  console.log('🚀 Starting Enhanced Search API Tests\n');
  console.log('=' * 60);
  
  const startTime = Date.now();
  
  try {
    const searchResults = await testEnhancedSearchAPI();
    await testGraphVisualizationAPI();
    const performanceResults = await testSearchPerformance();
    
    const totalDuration = Date.now() - startTime;
    
    console.log('=' * 60);
    console.log('📊 FINAL SUMMARY');
    console.log('=' * 60);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log(`Search Tests: ${searchResults.passed} passed, ${searchResults.failed} failed`);
    console.log(`Performance Tests: ${performanceResults.filter(r => r.success).length} successful`);
    
    return {
      searchResults,
      performanceResults,
      totalDuration
    };
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    return { error: error.message };
  }
}

// Export for use in other files
module.exports = {
  runSearchAPITests,
  testEnhancedSearchAPI,
  testSearchPerformance,
  testGraphVisualizationAPI
};

// Run tests if called directly
if (require.main === module) {
  runSearchAPITests().catch(console.error);
}
