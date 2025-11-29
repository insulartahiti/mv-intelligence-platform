// Graph Analytics Tests
// Test PageRank, centrality, and other graph algorithms

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function testPageRank() {
  console.log('🔍 Testing PageRank Algorithm...\n');
  
  try {
    // Test PageRank with limited data to avoid timeout
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .rpc('calculate_pagerank', {
        damping_factor: 0.85,
        max_iterations: 10,
        tolerance: 0.001
      });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw new Error(`PageRank calculation failed: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      throw new Error('No PageRank results returned');
    }
    
    // Validate PageRank results
    const firstResult = data[0];
    if (!firstResult.entity_id || typeof firstResult.pagerank !== 'number') {
      throw new Error('Invalid PageRank result structure');
    }
    
    console.log(`✅ PageRank calculated for ${data.length} entities in ${duration}ms`);
    console.log(`   Top entity: ${firstResult.entity_id} (rank: ${firstResult.pagerank.toFixed(6)})`);
    
    // Show top 5 entities
    console.log('\n📊 Top 5 Entities by PageRank:');
    data.slice(0, 5).forEach((entity, index) => {
      console.log(`   ${index + 1}. ${entity.entity_id} - ${entity.pagerank.toFixed(6)}`);
    });
    
    return {
      success: true,
      duration,
      entityCount: data.length,
      topEntity: firstResult
    };
    
  } catch (error) {
    console.log(`❌ PageRank test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testCentralityMetrics() {
  console.log('\n🔍 Testing Centrality Metrics...\n');
  
  try {
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .rpc('calculate_degree_centrality');
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw new Error(`Centrality calculation failed: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      throw new Error('No centrality results returned');
    }
    
    // Validate centrality results
    const firstResult = data[0];
    if (!firstResult.entity_id || typeof firstResult.degree_centrality !== 'number') {
      throw new Error('Invalid centrality result structure');
    }
    
    console.log(`✅ Centrality calculated for ${data.length} entities in ${duration}ms`);
    console.log(`   Most central entity: ${firstResult.entity_id} (centrality: ${firstResult.degree_centrality.toFixed(6)})`);
    
    // Show top 5 entities by centrality
    console.log('\n📊 Top 5 Entities by Degree Centrality:');
    data.slice(0, 5).forEach((entity, index) => {
      console.log(`   ${index + 1}. ${entity.entity_id} - ${entity.degree_centrality.toFixed(6)} (${entity.out_degree} out, ${entity.in_degree} in)`);
    });
    
    return {
      success: true,
      duration,
      entityCount: data.length,
      topEntity: firstResult
    };
    
  } catch (error) {
    console.log(`❌ Centrality test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testPathFinding() {
  console.log('\n🔍 Testing Path Finding...\n');
  
  try {
    // Get two sample entities that are likely connected
    const { data: entities } = await supabase
      .from('graph.entities')
      .select('id, name, type')
      .limit(10);
    
    if (!entities || entities.length < 2) {
      throw new Error('Not enough entities for path finding test');
    }
    
    const sourceId = entities[0].id;
    const targetId = entities[1].id;
    
    console.log(`Finding path from ${entities[0].name} to ${entities[1].name}...`);
    
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .rpc('find_shortest_path', {
        source_id: sourceId,
        target_id: targetId,
        max_depth: 3
      });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw new Error(`Path finding failed: ${error.message}`);
    }
    
    console.log(`✅ Path finding completed in ${duration}ms`);
    
    if (data && data.length > 0) {
      const path = data[0];
      console.log(`   Found path with ${path.path_length} steps`);
      console.log(`   Path strength: ${path.total_strength.toFixed(3)}`);
      console.log(`   Path nodes: ${path.path_nodes.length}`);
    } else {
      console.log('   No direct path found (this is normal for random entities)');
    }
    
    return {
      success: true,
      duration,
      pathCount: data ? data.length : 0,
      foundPath: data && data.length > 0
    };
    
  } catch (error) {
    console.log(`❌ Path finding test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testInfluentialEntities() {
  console.log('\n🔍 Testing Influential Entities...\n');
  
  try {
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .rpc('find_influential_entities', {
        min_connections: 5,
        limit_count: 10
      });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw new Error(`Influential entities search failed: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      throw new Error('No influential entities found');
    }
    
    console.log(`✅ Found ${data.length} influential entities in ${duration}ms`);
    
    // Show top influential entities
    console.log('\n📊 Top Influential Entities:');
    data.forEach((entity, index) => {
      console.log(`   ${index + 1}. ${entity.name} (${entity.type}) - ${entity.connection_count} connections, influence: ${entity.influence_score.toFixed(3)}`);
    });
    
    return {
      success: true,
      duration,
      entityCount: data.length,
      topEntity: data[0]
    };
    
  } catch (error) {
    console.log(`❌ Influential entities test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testGraphStructure() {
  console.log('\n🔍 Testing Graph Structure...\n');
  
  try {
    // Get basic graph statistics
    const { count: entityCount } = await supabase
      .from('graph.entities')
      .select('*', { count: 'exact', head: true });
    
    const { count: edgeCount } = await supabase
      .from('graph.edges')
      .select('*', { count: 'exact', head: true });
    
    // Calculate average degree
    const avgDegree = edgeCount > 0 ? (2 * edgeCount) / entityCount : 0;
    
    // Calculate network density
    const maxPossibleEdges = entityCount * (entityCount - 1) / 2;
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
    
    console.log(`✅ Graph structure analyzed:`);
    console.log(`   Entities: ${entityCount}`);
    console.log(`   Edges: ${edgeCount}`);
    console.log(`   Average Degree: ${avgDegree.toFixed(2)}`);
    console.log(`   Network Density: ${(density * 100).toFixed(4)}%`);
    
    // Check for isolated nodes
    const { data: isolatedNodes } = await supabase
      .from('graph.entities')
      .select('id')
      .not('id', 'in', 
        supabase
          .from('graph.edges')
          .select('source')
          .union(
            supabase
              .from('graph.edges')
              .select('target')
          )
      );
    
    const isolatedCount = isolatedNodes ? isolatedNodes.length : 0;
    console.log(`   Isolated Nodes: ${isolatedCount}`);
    
    return {
      success: true,
      entityCount,
      edgeCount,
      avgDegree,
      density,
      isolatedCount
    };
    
  } catch (error) {
    console.log(`❌ Graph structure test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testGraphAlgorithms() {
  console.log('\n🔍 Testing Graph Algorithms...\n');
  
  try {
    // Test all paths function
    const { data: entities } = await supabase
      .from('graph.entities')
      .select('id')
      .limit(2);
    
    if (!entities || entities.length < 2) {
      throw new Error('Not enough entities for algorithm test');
    }
    
    const startTime = Date.now();
    
    const { data, error } = await supabase
      .rpc('find_all_paths', {
        source_id: entities[0].id,
        target_id: entities[1].id,
        max_depth: 2,
        max_paths: 5
      });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw new Error(`All paths algorithm failed: ${error.message}`);
    }
    
    console.log(`✅ All paths algorithm completed in ${duration}ms`);
    console.log(`   Found ${data ? data.length : 0} paths`);
    
    if (data && data.length > 0) {
      const path = data[0];
      console.log(`   Best path score: ${path.path_score.toFixed(3)}`);
      console.log(`   Path length: ${path.path_length}`);
    }
    
    return {
      success: true,
      duration,
      pathCount: data ? data.length : 0
    };
    
  } catch (error) {
    console.log(`❌ Graph algorithms test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main test runner
async function runGraphAnalyticsTests() {
  console.log('🚀 Starting Graph Analytics Tests\n');
  console.log('=' * 60);
  
  const startTime = Date.now();
  const results = {};
  
  try {
    results.pagerank = await testPageRank();
    results.centrality = await testCentralityMetrics();
    results.pathfinding = await testPathFinding();
    results.influential = await testInfluentialEntities();
    results.structure = await testGraphStructure();
    results.algorithms = await testGraphAlgorithms();
    
    const totalDuration = Date.now() - startTime;
    
    // Print summary
    console.log('\n' + '=' * 60);
    console.log('📊 GRAPH ANALYTICS TEST SUMMARY');
    console.log('=' * 60);
    
    const passedTests = Object.values(results).filter(r => r.success).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);
    
    if (totalTests - passedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      Object.entries(results).forEach(([test, result]) => {
        if (!result.success) {
          console.log(`  - ${test}: ${result.error}`);
        }
      });
    }
    
    console.log('\n🎯 PERFORMANCE METRICS:');
    Object.entries(results).forEach(([test, result]) => {
      if (result.success && result.duration) {
        console.log(`  - ${test}: ${result.duration}ms`);
      }
    });
    
    console.log('\n' + (passedTests === totalTests ? '🎉 All graph analytics tests passed!' : '⚠️  Some tests failed'));
    
    return results;
    
  } catch (error) {
    console.error('❌ Graph analytics test suite failed:', error.message);
    return { error: error.message };
  }
}

// Export for use in other files
module.exports = {
  runGraphAnalyticsTests,
  testPageRank,
  testCentralityMetrics,
  testPathFinding,
  testInfluentialEntities,
  testGraphStructure,
  testGraphAlgorithms
};

// Run tests if called directly
if (require.main === module) {
  runGraphAnalyticsTests().catch(console.error);
}
