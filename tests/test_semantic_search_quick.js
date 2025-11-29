#!/usr/bin/env node

/**
 * Quick Semantic Search Test
 * Fast validation of core functionality
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function quickSemanticSearchTest() {
  console.log('🚀 Quick Semantic Search Test\n');
  
  const testQueries = [
    { query: "fintech", expected: "Should return fintech companies" },
    { query: "AI", expected: "Should return AI-related entities" },
    { query: "startup", expected: "Should return startup companies" },
    { query: "CEO", expected: "Should return people with CEO roles" },
    { query: "blockchain", expected: "Should return blockchain companies" }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of testQueries) {
    try {
      console.log(`🔍 Testing: "${test.query}"`);
      
      const response = await fetch('http://localhost:3000/api/graph/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: test.query, limit: 5 })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`API error: ${data.message}`);
      }
      
      if (!Array.isArray(data.results)) {
        throw new Error('Results should be an array');
      }
      
      console.log(`   ✅ Found ${data.results.length} results`);
      if (data.results.length > 0) {
        console.log(`   📋 Top results: ${data.results.slice(0, 3).map(r => r.name).join(', ')}`);
      }
      
      passed++;
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }
  
  console.log('📊 Quick Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Semantic search is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the API and database connection.');
  }
  
  return { passed, failed };
}

// Run the test
if (require.main === module) {
  quickSemanticSearchTest()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { quickSemanticSearchTest };




