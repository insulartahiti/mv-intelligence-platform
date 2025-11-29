#!/usr/bin/env node

/**
 * Comprehensive Semantic Search Testing Suite
 * Tests functionality, quality, and performance of semantic search
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test cases organized by category
const testCases = {
  // Basic functionality tests
  basic: [
    { query: "fintech", description: "Basic industry search" },
    { query: "AI companies", description: "Multi-word query" },
    { query: "venture capital", description: "Service type search" },
    { query: "blockchain", description: "Technology search" },
    { query: "healthcare", description: "Sector search" }
  ],
  
  // Company-specific searches
  companies: [
    { query: "Tesla", description: "Well-known company" },
    { query: "startup", description: "Company stage search" },
    { query: "Series A", description: "Funding stage search" },
    { query: "unicorn", description: "Valuation search" },
    { query: "IPO", description: "Exit type search" }
  ],
  
  // Person-specific searches
  people: [
    { query: "CEO", description: "Role search" },
    { query: "founder", description: "Founder search" },
    { query: "investor", description: "Investor search" },
    { query: "engineer", description: "Technical role search" },
    { query: "stealth", description: "Stealth mode search" }
  ],
  
  // Geographic searches
  geographic: [
    { query: "San Francisco", description: "City search" },
    { query: "New York", description: "Major city search" },
    { query: "Europe", description: "Region search" },
    { query: "London", description: "International city search" }
  ],
  
  // Technology searches
  technology: [
    { query: "machine learning", description: "AI technology search" },
    { query: "SaaS", description: "Business model search" },
    { query: "mobile app", description: "Platform search" },
    { query: "API", description: "Technical term search" },
    { query: "cloud", description: "Infrastructure search" }
  ],
  
  // Edge cases
  edgeCases: [
    { query: "", description: "Empty query" },
    { query: "a", description: "Single character" },
    { query: "xyz123abc", description: "Random string" },
    { query: "!@#$%^&*()", description: "Special characters" },
    { query: "very long query that goes on and on and should still work properly", description: "Very long query" }
  ],
  
  // Filter tests
  filters: [
    { 
      query: "AI", 
      filters: { entityTypes: ["company"] },
      description: "AI companies only" 
    },
    {
      query: "fintech",
      filters: { showInternalOnly: true },
      description: "Internal fintech entities"
    },
    {
      query: "startup",
      filters: { showLinkedInOnly: true },
      description: "LinkedIn startup connections"
    }
  ]
};

async function testSemanticSearch() {
  console.log('🧠 Starting Comprehensive Semantic Search Testing...\n');
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  const results = {
    basic: { passed: 0, failed: 0, details: [] },
    companies: { passed: 0, failed: 0, details: [] },
    people: { passed: 0, failed: 0, details: [] },
    geographic: { passed: 0, failed: 0, details: [] },
    technology: { passed: 0, failed: 0, details: [] },
    edgeCases: { passed: 0, failed: 0, details: [] },
    filters: { passed: 0, failed: 0, details: [] }
  };
  
  // Test each category
  for (const [category, tests] of Object.entries(testCases)) {
    console.log(`\n📊 Testing ${category.toUpperCase()} searches:`);
    console.log('=' .repeat(50));
    
    for (const testCase of tests) {
      totalTests++;
      const startTime = Date.now();
      
      try {
        const response = await fetch('http://localhost:3000/api/graph/semantic-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: testCase.query,
            filters: testCase.filters || {},
            limit: 10
          })
        });
        
        const responseTime = Date.now() - startTime;
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Validate response structure
        if (!data.success) {
          throw new Error(`API returned success: false - ${data.message}`);
        }
        
        if (!Array.isArray(data.results)) {
          throw new Error('Results should be an array');
        }
        
        // Analyze results
        const analysis = analyzeResults(testCase, data.results, responseTime);
        
        if (analysis.passed) {
          passedTests++;
          results[category].passed++;
          console.log(`✅ ${testCase.description}: ${data.results.length} results (${responseTime}ms)`);
          if (data.results.length > 0) {
            console.log(`   Top result: ${data.results[0].name} (${data.results[0].type})`);
          }
        } else {
          failedTests++;
          results[category].failed++;
          console.log(`❌ ${testCase.description}: ${analysis.reason}`);
        }
        
        results[category].details.push({
          query: testCase.query,
          description: testCase.description,
          passed: analysis.passed,
          reason: analysis.reason,
          resultCount: data.results.length,
          responseTime: responseTime,
          topResults: data.results.slice(0, 3).map(r => ({ name: r.name, type: r.type }))
        });
        
      } catch (error) {
        failedTests++;
        results[category].failed++;
        console.log(`❌ ${testCase.description}: ERROR - ${error.message}`);
        
        results[category].details.push({
          query: testCase.query,
          description: testCase.description,
          passed: false,
          reason: `ERROR: ${error.message}`,
          resultCount: 0,
          responseTime: Date.now() - startTime,
          topResults: []
        });
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SEMANTIC SEARCH TEST SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`\n🎯 Overall Results:`);
  console.log(`   Total Tests: ${totalTests}`);
  console.log(`   Passed: ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
  console.log(`   Failed: ${failedTests} (${((failedTests/totalTests)*100).toFixed(1)}%)`);
  
  console.log(`\n📊 Category Breakdown:`);
  for (const [category, stats] of Object.entries(results)) {
    const total = stats.passed + stats.failed;
    const percentage = total > 0 ? ((stats.passed/total)*100).toFixed(1) : 0;
    console.log(`   ${category.toUpperCase()}: ${stats.passed}/${total} (${percentage}%)`);
  }
  
  // Performance analysis
  console.log(`\n⚡ Performance Analysis:`);
  const allDetails = Object.values(results).flatMap(r => r.details);
  const responseTimes = allDetails.map(d => d.responseTime).filter(t => t > 0);
  if (responseTimes.length > 0) {
    const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxTime = Math.max(...responseTimes);
    const minTime = Math.min(...responseTimes);
    console.log(`   Average Response Time: ${avgTime.toFixed(0)}ms`);
    console.log(`   Fastest Response: ${minTime}ms`);
    console.log(`   Slowest Response: ${maxTime}ms`);
  }
  
  // Quality analysis
  console.log(`\n🎯 Quality Analysis:`);
  const queriesWithResults = allDetails.filter(d => d.resultCount > 0);
  const avgResults = queriesWithResults.length > 0 ? 
    queriesWithResults.reduce((a, b) => a + b.resultCount, 0) / queriesWithResults.length : 0;
  console.log(`   Queries with Results: ${queriesWithResults.length}/${allDetails.length}`);
  console.log(`   Average Results per Query: ${avgResults.toFixed(1)}`);
  
  // Recommendations
  console.log(`\n💡 Recommendations:`);
  if (failedTests > 0) {
    console.log(`   - ${failedTests} tests failed - investigate specific issues`);
  }
  if (responseTimes.length > 0 && Math.max(...responseTimes) > 2000) {
    console.log(`   - Some queries are slow (>2s) - consider optimization`);
  }
  if (avgResults < 3) {
    console.log(`   - Low result counts - consider expanding search scope`);
  }
  if (passedTests / totalTests > 0.9) {
    console.log(`   - Excellent performance! Semantic search is working well`);
  }
  
  return results;
}

function analyzeResults(testCase, results, responseTime) {
  // Basic validation
  if (responseTime > 10000) {
    return { passed: false, reason: `Response too slow: ${responseTime}ms` };
  }
  
  // For empty queries, we expect either no results or an error
  if (testCase.query === "") {
    return { passed: true, reason: "Empty query handled appropriately" };
  }
  
  // For edge cases with special characters, we just want no crashes
  if (testCase.description.includes("Special characters") || testCase.description.includes("Random string")) {
    return { passed: true, reason: "Edge case handled without crashing" };
  }
  
  // For meaningful queries, we expect some results
  if (testCase.description.includes("Empty query") || testCase.description.includes("Single character")) {
    return { passed: true, reason: "Edge case handled appropriately" };
  }
  
  // For normal queries, we expect results
  if (results.length === 0) {
    return { passed: false, reason: "No results returned for meaningful query" };
  }
  
  // Check result quality
  const hasRelevantResults = results.some(result => 
    result.name.toLowerCase().includes(testCase.query.toLowerCase()) ||
    result.metadata?.industry?.toLowerCase().includes(testCase.query.toLowerCase()) ||
    result.metadata?.domain?.toLowerCase().includes(testCase.query.toLowerCase())
  );
  
  if (!hasRelevantResults && results.length > 0) {
    return { passed: false, reason: "Results don't appear relevant to query" };
  }
  
  return { passed: true, reason: `Good results: ${results.length} entities found` };
}

// Run the tests
if (require.main === module) {
  testSemanticSearch()
    .then(() => {
      console.log('\n🎉 Semantic search testing complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testSemanticSearch };




