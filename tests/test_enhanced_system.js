// Enhanced Knowledge Graph Intelligence - System Tests
// Comprehensive testing of all implemented features

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  sampleSize: 100,
  testQueries: [
    'fintech companies',
    'who can connect me to John Doe',
    'investors in AI startups',
    'similar to Stripe',
    'competitive analysis of Square'
  ]
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  errors: [],
  performance: {}
};

// Utility functions
function logTest(testName, status, duration, details = '') {
  const result = { testName, status, duration, details, timestamp: new Date() };
  
  if (status === 'PASSED') {
    testResults.passed++;
    console.log(`✅ ${testName} (${duration}ms) ${details}`);
  } else {
    testResults.failed++;
    testResults.errors.push(result);
    console.log(`❌ ${testName} (${duration}ms) ${details}`);
  }
  
  testResults.performance[testName] = duration;
}

async function runTest(testName, testFunction) {
  const startTime = Date.now();
  try {
    const result = await Promise.race([
      testFunction(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout)
      )
    ]);
    const duration = Date.now() - startTime;
    logTest(testName, 'PASSED', duration, result);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logTest(testName, 'FAILED', duration, error.message);
    return null;
  }
}

// Test 1: Database Schema Tests
async function testDatabaseSchema() {
  console.log('\n🔍 Testing Database Schema...');
  
  // Test enrichment tables
  await runTest('Enrichment Tables Exist', async () => {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'graph')
      .like('table_name', '%enrichment%');
    
    if (error) throw error;
    const tableNames = data.map(t => t.table_name);
    const expectedTables = ['perplexity_enrichment', 'linkedin_enrichment', 'web_research_enrichment', 'enrichment_unified'];
    
    const missingTables = expectedTables.filter(t => !tableNames.includes(t));
    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }
    
    return `Found ${tableNames.length} enrichment tables`;
  });

  // Test computed columns
  await runTest('Computed Columns Exist', async () => {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'graph')
      .eq('table_name', 'entities')
      .like('column_name', 'computed_%');
    
    if (error) throw error;
    const columnNames = data.map(c => c.column_name);
    const expectedColumns = ['computed_expertise', 'computed_skills', 'computed_company'];
    
    const missingColumns = expectedColumns.filter(c => !columnNames.includes(c));
    if (missingColumns.length > 0) {
      throw new Error(`Missing columns: ${missingColumns.join(', ')}`);
    }
    
    return `Found ${columnNames.length} computed columns`;
  });

  // Test 3072d embedding columns
  await runTest('3072d Embedding Columns Exist', async () => {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'graph')
      .eq('table_name', 'entities')
      .like('column_name', '%embedding%');
    
    if (error) throw error;
    const hasEmbedding = data.some(c => c.column_name === 'embedding');
    const hasEmbedding3072 = data.some(c => c.column_name === 'embedding_3072');
    
    if (!hasEmbedding || !hasEmbedding3072) {
      throw new Error('Missing embedding columns');
    }
    
    return `Found both 1536d and 3072d embedding columns`;
  });
}

// Test 2: Graph Function Tests
async function testGraphFunctions() {
  console.log('\n🔍 Testing Graph Functions...');
  
  // Test find_influential_entities
  await runTest('Find Influential Entities', async () => {
    const { data, error } = await supabase
      .rpc('find_influential_entities', { min_connections: 2, limit_count: 5 });
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No influential entities found');
    }
    
    const topEntity = data[0];
    if (!topEntity.id || !topEntity.name || !topEntity.connection_count) {
      throw new Error('Invalid entity data structure');
    }
    
    return `Found ${data.length} influential entities, top: ${topEntity.name} (${topEntity.connection_count} connections)`;
  });

  // Test calculate_entity_influence
  await runTest('Calculate Entity Influence', async () => {
    // Get a sample entity ID
    const { data: sampleEntity } = await supabase
      .from('graph.entities')
      .select('id')
      .limit(1)
      .single();
    
    if (!sampleEntity) {
      throw new Error('No entities found for testing');
    }
    
    const { data, error } = await supabase
      .rpc('calculate_entity_influence', { entity_id: sampleEntity.id });
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No influence data returned');
    }
    
    const influence = data[0];
    if (typeof influence.influence_score !== 'number') {
      throw new Error('Invalid influence score structure');
    }
    
    return `Entity influence calculated: ${influence.influence_score.toFixed(3)}`;
  });

  // Test graph-aware search (with sample embedding)
  await runTest('Graph-Aware Search', async () => {
    // Get a sample embedding
    const { data: sampleEntity } = await supabase
      .from('graph.entities')
      .select('embedding')
      .not('embedding', 'is', null)
      .limit(1)
      .single();
    
    if (!sampleEntity || !sampleEntity.embedding) {
      throw new Error('No embeddings found for testing');
    }
    
    const { data, error } = await supabase
      .rpc('semantic_search_with_graph_boost', {
        query_embedding: sampleEntity.embedding,
        match_threshold: 0.3,
        match_count: 5
      });
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No search results returned');
    }
    
    const result = data[0];
    if (!result.id || !result.name || typeof result.final_score !== 'number') {
      throw new Error('Invalid search result structure');
    }
    
    return `Graph-aware search returned ${data.length} results, top: ${result.name} (score: ${result.final_score.toFixed(3)})`;
  });
}

// Test 3: Search System Tests
async function testSearchSystem() {
  console.log('\n🔍 Testing Search System...');
  
  // Test basic semantic search
  await runTest('Basic Semantic Search', async () => {
    const { data, error } = await supabase
      .rpc('match_entities', {
        query_embedding: new Array(1536).fill(0.1), // Dummy embedding
        match_threshold: 0.1,
        match_count: 5
      });
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No search results returned');
    }
    
    return `Semantic search returned ${data.length} results`;
  });

  // Test hybrid search
  await runTest('Hybrid Search Enhanced', async () => {
    const { data, error } = await supabase
      .rpc('hybrid_search_enhanced', {
        query_text: 'fintech',
        query_embedding: new Array(1536).fill(0.1),
        match_threshold: 0.1,
        match_count: 5
      });
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No hybrid search results returned');
    }
    
    return `Hybrid search returned ${data.length} results`;
  });

  // Test 3072d search (if embeddings exist)
  await runTest('3072d Embedding Search', async () => {
    const { data: has3072d } = await supabase
      .from('graph.entities')
      .select('id')
      .not('embedding_3072', 'is', null)
      .limit(1)
      .single();
    
    if (!has3072d) {
      return 'No 3072d embeddings found, skipping test';
    }
    
    const { data, error } = await supabase
      .rpc('match_entities_3072', {
        query_embedding: new Array(3072).fill(0.1),
        match_threshold: 0.1,
        match_count: 5
      });
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No 3072d search results returned');
    }
    
    return `3072d search returned ${data.length} results`;
  });
}

// Test 4: Graph Analytics Tests
async function testGraphAnalytics() {
  console.log('\n🔍 Testing Graph Analytics...');
  
  // Test degree centrality
  await runTest('Degree Centrality Calculation', async () => {
    const { data, error } = await supabase
      .rpc('calculate_degree_centrality');
    
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No centrality data returned');
    }
    
    const topEntity = data[0];
    if (typeof topEntity.degree_centrality !== 'number') {
      throw new Error('Invalid centrality data structure');
    }
    
    return `Calculated centrality for ${data.length} entities, top: ${topEntity.degree_centrality.toFixed(3)}`;
  });

  // Test path finding
  await runTest('Path Finding', async () => {
    // Get two sample entities
    const { data: entities } = await supabase
      .from('graph.entities')
      .select('id')
      .limit(2);
    
    if (!entities || entities.length < 2) {
      throw new Error('Not enough entities for path finding test');
    }
    
    const { data, error } = await supabase
      .rpc('find_shortest_path', {
        source_id: entities[0].id,
        target_id: entities[1].id,
        max_depth: 3
      });
    
    if (error) throw error;
    // Path finding might return empty results, which is OK
    return `Path finding completed, found ${data ? data.length : 0} paths`;
  });
}

// Test 5: Data Quality Tests
async function testDataQuality() {
  console.log('\n🔍 Testing Data Quality...');
  
  // Test entity count
  await runTest('Entity Count', async () => {
    const { count, error } = await supabase
      .from('graph.entities')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    if (count < 1000) {
      throw new Error(`Low entity count: ${count}`);
    }
    
    return `Found ${count} entities`;
  });

  // Test edge count
  await runTest('Edge Count', async () => {
    const { count, error } = await supabase
      .from('graph.edges')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    if (count < 1000) {
      throw new Error(`Low edge count: ${count}`);
    }
    
    return `Found ${count} edges`;
  });

  // Test embedding coverage
  await runTest('Embedding Coverage', async () => {
    const { count: totalEntities } = await supabase
      .from('graph.entities')
      .select('*', { count: 'exact', head: true });
    
    const { count: entitiesWithEmbeddings } = await supabase
      .from('graph.entities')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    const coverage = (entitiesWithEmbeddings / totalEntities) * 100;
    
    if (coverage < 1) {
      throw new Error(`Low embedding coverage: ${coverage.toFixed(2)}%`);
    }
    
    return `Embedding coverage: ${coverage.toFixed(2)}% (${entitiesWithEmbeddings}/${totalEntities})`;
  });
}

// Test 6: Performance Tests
async function testPerformance() {
  console.log('\n🔍 Testing Performance...');
  
  // Test search performance
  await runTest('Search Performance', async () => {
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .rpc('match_entities', {
        query_embedding: new Array(1536).fill(0.1),
        match_threshold: 0.1,
        match_count: 10
      });
    
    const duration = Date.now() - startTime;
    
    if (error) throw error;
    if (duration > 5000) {
      throw new Error(`Search too slow: ${duration}ms`);
    }
    
    return `Search completed in ${duration}ms`;
  });

  // Test graph function performance
  await runTest('Graph Function Performance', async () => {
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .rpc('find_influential_entities', { min_connections: 1, limit_count: 10 });
    
    const duration = Date.now() - startTime;
    
    if (error) throw error;
    if (duration > 10000) {
      throw new Error(`Graph function too slow: ${duration}ms`);
    }
    
    return `Graph function completed in ${duration}ms`;
  });
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Enhanced Knowledge Graph Intelligence Tests\n');
  console.log('=' * 60);
  
  const startTime = Date.now();
  
  try {
    await testDatabaseSchema();
    await testGraphFunctions();
    await testSearchSystem();
    await testGraphAnalytics();
    await testDataQuality();
    await testPerformance();
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Print summary
  console.log('\n' + '=' * 60);
  console.log('📊 TEST SUMMARY');
  console.log('=' * 60);
  console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.errors.forEach(error => {
      console.log(`  - ${error.testName}: ${error.details}`);
    });
  }
  
  console.log('\n🎯 PERFORMANCE METRICS:');
  Object.entries(testResults.performance).forEach(([test, duration]) => {
    console.log(`  - ${test}: ${duration}ms`);
  });
  
  console.log('\n' + (testResults.failed === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed'));
  
  return testResults;
}

// Export for use in other files
module.exports = {
  runAllTests,
  testDatabaseSchema,
  testGraphFunctions,
  testSearchSystem,
  testGraphAnalytics,
  testDataQuality,
  testPerformance
};

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
