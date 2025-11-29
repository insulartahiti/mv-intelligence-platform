/**
 * Precompute Graph Metrics for Performance
 * This script calculates centrality, community detection, and other graph metrics
 * that can be cached and used for faster queries
 */

const { driver, NEO4J_DATABASE } = require('../lib/neo4j');

async function precomputeGraphMetrics() {
  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log('🚀 Precomputing graph metrics for performance optimization...');

    // 1. Calculate PageRank centrality for all nodes
    console.log('📊 Calculating PageRank centrality...');
    await session.run(`
      CALL gds.pageRank.write('graph', {
        writeProperty: 'pagerank_score',
        maxIterations: 20,
        dampingFactor: 0.85
      })
    `);

    // 2. Calculate Betweenness centrality
    console.log('📊 Calculating Betweenness centrality...');
    await session.run(`
      CALL gds.betweenness.write('graph', {
        writeProperty: 'betweenness_score'
      })
    `);

    // 3. Calculate Closeness centrality
    console.log('📊 Calculating Closeness centrality...');
    await session.run(`
      CALL gds.closeness.write('graph', {
        writeProperty: 'closeness_score'
      })
    `);

    // 4. Community detection using Louvain algorithm
    console.log('📊 Detecting communities using Louvain...');
    await session.run(`
      CALL gds.louvain.write('graph', {
        writeProperty: 'community_id',
        maxIterations: 10
      })
    `);

    // 5. Calculate triangle count for clustering coefficient
    console.log('📊 Calculating triangle counts...');
    await session.run(`
      CALL gds.triangleCount.write('graph', {
        writeProperty: 'triangle_count'
      })
    `);

    // 6. Calculate degree centrality
    console.log('📊 Calculating degree centrality...');
    await session.run(`
      MATCH (n:Entity)
      SET n.degree_centrality = size((n)-[:RELATES]-())
    `);

    // 7. Calculate clustering coefficient
    console.log('📊 Calculating clustering coefficient...');
    await session.run(`
      MATCH (n:Entity)
      WHERE n.triangle_count > 0
      SET n.clustering_coefficient = (2.0 * n.triangle_count) / (n.degree_centrality * (n.degree_centrality - 1))
    `);

    // 8. Calculate path lengths to internal entities
    console.log('📊 Calculating path lengths to internal entities...');
    await session.run(`
      MATCH (internal:Entity {is_internal: true})
      MATCH (n:Entity)
      WHERE n <> internal
      OPTIONAL MATCH path = shortestPath((n)-[:RELATES*1..5]-(internal))
      SET n.path_to_internal = CASE WHEN path IS NOT NULL THEN length(path) ELSE null END
    `);

    // 9. Calculate relationship strength scores
    console.log('📊 Calculating relationship strength scores...');
    await session.run(`
      MATCH (n:Entity)-[r:RELATES]-(m:Entity)
      WITH n, avg(r.strength_score) as avg_strength, count(r) as rel_count
      SET n.avg_relationship_strength = avg_strength,
          n.relationship_count = rel_count
    `);

    // 10. Create a composite importance score
    console.log('📊 Creating composite importance score...');
    await session.run(`
      MATCH (n:Entity)
      SET n.composite_importance = 
        (COALESCE(n.importance, 0) * 0.3) +
        (COALESCE(n.pagerank_score, 0) * 0.25) +
        (COALESCE(n.betweenness_score, 0) * 0.2) +
        (COALESCE(n.closeness_score, 0) * 0.15) +
        (COALESCE(n.degree_centrality, 0) / 100.0 * 0.1)
    `);

    console.log('✅ Graph metrics precomputation completed!');

    // Show some statistics
    const stats = await session.run(`
      MATCH (n:Entity)
      RETURN 
        count(n) as total_nodes,
        avg(n.pagerank_score) as avg_pagerank,
        avg(n.betweenness_score) as avg_betweenness,
        avg(n.closeness_score) as avg_closeness,
        avg(n.degree_centrality) as avg_degree,
        avg(n.composite_importance) as avg_composite_importance
    `);

    const stat = stats.records[0].toObject();
    console.log('\n📈 Graph Statistics:');
    console.log(`Total nodes: ${stat.total_nodes}`);
    console.log(`Average PageRank: ${stat.avg_pagerank?.toFixed(4)}`);
    console.log(`Average Betweenness: ${stat.avg_betweenness?.toFixed(4)}`);
    console.log(`Average Closeness: ${stat.avg_closeness?.toFixed(4)}`);
    console.log(`Average Degree: ${stat.avg_degree?.toFixed(2)}`);
    console.log(`Average Composite Importance: ${stat.avg_composite_importance?.toFixed(4)}`);

  } catch (error) {
    console.error('Error precomputing graph metrics:', error);
    
    // If GDS procedures are not available, create basic metrics
    console.log('⚠️ GDS procedures not available, creating basic metrics...');
    
    try {
      // Basic centrality calculation
      await session.run(`
        MATCH (n:Entity)
        SET n.degree_centrality = size((n)-[:RELATES]-())
      `);

      // Basic importance calculation
      await session.run(`
        MATCH (n:Entity)
        SET n.composite_importance = 
          (COALESCE(n.importance, 0) * 0.7) +
          (COALESCE(n.degree_centrality, 0) / 100.0 * 0.3)
      `);

      console.log('✅ Basic metrics created successfully');
    } catch (basicError) {
      console.error('Error creating basic metrics:', basicError);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

// Run the script
precomputeGraphMetrics().catch(console.error);
