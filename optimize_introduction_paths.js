#!/usr/bin/env node

/**
 * Optimized Introduction Paths System
 * Advanced network analysis and introduction path optimization
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// ADVANCED NETWORK ANALYSIS
// ============================================================================

class NetworkAnalyzer {
  constructor() {
    this.graph = new Map();
    this.entities = new Map();
    this.edgeWeights = new Map();
  }

  async loadNetwork() {
    console.log('📊 Loading network data...');
    
    try {
      // Load entities
      const { data: entities, error: entityError } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, domain, industry, is_internal, is_portfolio, is_pipeline, enrichment_data');
      
      if (entityError) {
        console.error('Error loading entities:', entityError);
        return;
      }
      
      if (entities) {
        entities.forEach(entity => {
          this.entities.set(entity.id, entity);
        });
        console.log(`✅ Loaded ${entities.length} entities`);
      }

      // Load edges
      const { data: edges, error: edgeError } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, target, kind, strength_score, interaction_count, confidence_score');
      
      if (edgeError) {
        console.error('Error loading edges:', edgeError);
        return;
      }
      
      if (edges) {
        edges.forEach(edge => {
          if (!this.graph.has(edge.source)) {
            this.graph.set(edge.source, []);
          }
          this.graph.get(edge.source).push({
            target: edge.target,
            kind: edge.kind,
            strength: edge.strength_score || 0.5,
            weight: edge.interaction_count || 1.0,
            metadata: { confidence: edge.confidence_score }
          });
          
          // Store edge weight for bidirectional access
          const edgeKey = `${edge.source}-${edge.target}`;
          this.edgeWeights.set(edgeKey, edge.strength_score || 0.5);
        });
        console.log(`✅ Loaded ${edges.length} edges`);
      }

      console.log(`📊 Network loaded: ${this.entities.size} entities, ${edges?.length || 0} edges`);
    } catch (error) {
      console.error('Error in loadNetwork:', error);
    }
  }

  // Calculate entity influence score
  calculateInfluenceScore(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return 0;

    let score = 0;
    
    // Base score from entity type and flags
    if (entity.is_internal) score += 10;
    if (entity.is_portfolio) score += 8;
    if (entity.is_pipeline) score += 6;
    if (entity.linkedin_first_degree) score += 4;
    
    // Network connectivity score
    const outgoingConnections = this.graph.get(entityId) || [];
    const incomingConnections = Array.from(this.graph.entries())
      .filter(([_, connections]) => connections.some(conn => conn.target === entityId))
      .length;
    
    score += (outgoingConnections.length + incomingConnections) * 0.5;
    
    // Industry influence (if in a well-connected industry)
    if (entity.industry) {
      const industryEntities = Array.from(this.entities.values())
        .filter(e => e.industry === entity.industry);
      score += Math.min(industryEntities.length * 0.1, 5);
    }
    
    return Math.min(score, 20); // Cap at 20
  }

  // Find optimal introduction paths
  findOptimalPaths(sourceId, targetId, options = {}) {
    const {
      maxHops = 4,
      maxPaths = 10,
      minStrength = 0.3,
      preferLinkedIn = true,
      preferInternal = true
    } = options;

    const paths = [];
    const queue = [{
      current: sourceId,
      path: [sourceId],
      strength: 1.0,
      visited: new Set([sourceId]),
      linkedinCount: 0,
      internalCount: 0
    }];

    while (queue.length > 0 && paths.length < maxPaths) {
      const { current, path, strength, visited, linkedinCount, internalCount } = queue.shift();

      if (current === targetId) {
        const pathInfo = this.buildPathInfo(path, strength, linkedinCount, internalCount);
        if (pathInfo.totalStrength >= minStrength) {
          paths.push(pathInfo);
        }
        continue;
      }

      if (path.length >= maxHops) continue;

      const neighbors = this.graph.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.target)) {
          const newVisited = new Set(visited);
          newVisited.add(neighbor.target);
          
          const entity = this.entities.get(neighbor.target);
          const newLinkedinCount = linkedinCount + (entity?.linkedin_first_degree ? 1 : 0);
          const newInternalCount = internalCount + (entity?.is_internal ? 1 : 0);
          
          queue.push({
            current: neighbor.target,
            path: [...path, neighbor.target],
            strength: strength * neighbor.strength,
            visited: newVisited,
            linkedinCount: newLinkedinCount,
            internalCount: newInternalCount
          });
        }
      }
    }

    // Sort paths by quality score
    return paths.sort((a, b) => this.calculatePathQuality(b) - this.calculatePathQuality(a));
  }

  buildPathInfo(path, strength, linkedinCount, internalCount) {
    const entities = path.map(id => this.entities.get(id)).filter(Boolean);
    
    return {
      path: entities.map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        isInternal: e.is_internal,
        isLinkedIn: e.linkedin_first_degree
      })),
      totalStrength: strength,
      linkedinConnections: linkedinCount,
      internalConnections: internalCount,
      pathLength: path.length - 1,
      qualityScore: this.calculatePathQuality({
        strength,
        linkedinCount,
        internalCount,
        pathLength: path.length - 1
      })
    };
  }

  calculatePathQuality(pathInfo) {
    let score = pathInfo.strength * 10; // Base strength score
    
    // Bonus for LinkedIn connections
    score += pathInfo.linkedinConnections * 2;
    
    // Bonus for internal connections
    score += pathInfo.internalConnections * 1.5;
    
    // Penalty for longer paths
    score -= (pathInfo.pathLength - 1) * 0.5;
    
    return Math.max(score, 0);
  }

  // Find warm introduction opportunities
  findWarmIntroductions(targetId, maxPaths = 5) {
    const internalOwners = Array.from(this.entities.values())
      .filter(e => e.is_internal && e.type === 'person');
    
    if (internalOwners.length === 0) {
      console.log('No internal owners found');
      return [];
    }

    const allPaths = [];
    
    for (const internalOwner of internalOwners) {
      const paths = this.findOptimalPaths(internalOwner.id, targetId, {
        maxHops: 3,
        maxPaths: 3,
        minStrength: 0.4
      });
      allPaths.push(...paths);
    }

    // Remove duplicates and sort by quality
    const uniquePaths = this.removeDuplicatePaths(allPaths);
    return uniquePaths.slice(0, maxPaths);
  }

  removeDuplicatePaths(paths) {
    const seen = new Set();
    return paths.filter(path => {
      const pathKey = path.path.map(p => p.id).join('-');
      if (seen.has(pathKey)) return false;
      seen.add(pathKey);
      return true;
    });
  }

  // Analyze network connectivity
  analyzeConnectivity(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return null;

    const outgoingConnections = this.graph.get(entityId) || [];
    const incomingConnections = Array.from(this.graph.entries())
      .filter(([_, connections]) => connections.some(conn => conn.target === entityId))
      .map(([sourceId, _]) => sourceId);

    const totalConnections = outgoingConnections.length + incomingConnections.length;
    const influenceScore = this.calculateInfluenceScore(entityId);
    
    // Calculate network density
    const possibleConnections = this.entities.size - 1;
    const networkDensity = totalConnections / possibleConnections;

    return {
      entityId,
      entityName: entity.name,
      totalConnections,
      outgoingConnections: outgoingConnections.length,
      incomingConnections: incomingConnections.length,
      influenceScore,
      networkDensity,
      isWellConnected: totalConnections > 5,
      isInfluential: influenceScore > 10
    };
  }
}

// ============================================================================
// INTRODUCTION PATH OPTIMIZATION
// ============================================================================

async function optimizeIntroductionPaths() {
  console.log('🎯 Optimizing Introduction Paths...\n');

  const analyzer = new NetworkAnalyzer();
  await analyzer.loadNetwork();

  // Find all target entities (non-internal)
  const targetEntities = Array.from(analyzer.entities.values())
    .filter(e => !e.is_internal && e.type === 'person')
    .slice(0, 20); // Process first 20 for testing

  console.log(`📊 Analyzing introduction paths for ${targetEntities.length} target entities...`);

  const results = [];

  for (const target of targetEntities) {
    console.log(`\n🔍 Analyzing paths to ${target.name}...`);
    
    const warmIntroductions = analyzer.findWarmIntroductions(target.id);
    const connectivity = analyzer.analyzeConnectivity(target.id);
    
    if (warmIntroductions.length > 0) {
      results.push({
        target: {
          id: target.id,
          name: target.name,
          type: target.type,
          industry: target.industry
        },
        warmIntroductions,
        connectivity,
        hasPaths: true
      });
      
      console.log(`✅ Found ${warmIntroductions.length} introduction paths`);
    } else {
      console.log(`⚠️ No introduction paths found`);
    }
  }

  // Store results
  await storeIntroductionPathResults(results);
  
  // Generate network insights
  await generateNetworkInsights(analyzer);

  console.log('\n🎉 Introduction path optimization complete!');
  return results;
}

async function storeIntroductionPathResults(results) {
  console.log('💾 Storing introduction path results...');
  
  for (const result of results) {
    if (result.hasPaths) {
      // Store each path
      for (const path of result.warmIntroductions) {
        await supabase
          .schema('graph')
          .from('introduction_paths')
          .upsert({
            source_entity_id: path.path[0].id,
            target_entity_id: result.target.id,
            path_data: path,
            path_strength: path.totalStrength,
            quality_score: path.qualityScore,
            calculated_at: new Date().toISOString()
          }, { onConflict: 'source_entity_id,target_entity_id' });
      }
    }
  }
}

async function generateNetworkInsights(analyzer) {
  console.log('🧠 Generating network insights...');
  
  const allEntities = Array.from(analyzer.entities.values());
  const insights = {
    totalEntities: allEntities.length,
    totalConnections: Array.from(analyzer.graph.values()).reduce((sum, connections) => sum + connections.length, 0),
    wellConnectedEntities: 0,
    influentialEntities: 0,
    networkDensity: 0,
    topInfluencers: [],
    industryDistribution: {},
    connectionTypes: {}
  };

  // Analyze each entity
  for (const entity of allEntities) {
    const connectivity = analyzer.analyzeConnectivity(entity.id);
    
    if (connectivity.isWellConnected) insights.wellConnectedEntities++;
    if (connectivity.isInfluential) insights.influentialEntities++;
    
    // Track industry distribution
    if (entity.industry) {
      insights.industryDistribution[entity.industry] = (insights.industryDistribution[entity.industry] || 0) + 1;
    }
  }

  // Find top influencers
  const influencers = allEntities
    .map(entity => ({
      id: entity.id,
      name: entity.name,
      influenceScore: analyzer.calculateInfluenceScore(entity.id)
    }))
    .sort((a, b) => b.influenceScore - a.influenceScore)
    .slice(0, 10);

  insights.topInfluencers = influencers;
  insights.networkDensity = insights.totalConnections / (insights.totalEntities * (insights.totalEntities - 1));

  // Store insights
  await supabase
    .schema('graph')
    .from('network_insights')
    .upsert({
      id: 'current',
      insights_data: insights,
      calculated_at: new Date().toISOString()
    }, { onConflict: 'id' });

  console.log('📊 Network Insights:');
  console.log(`   • Total entities: ${insights.totalEntities}`);
  console.log(`   • Total connections: ${insights.totalConnections}`);
  console.log(`   • Well-connected entities: ${insights.wellConnectedEntities}`);
  console.log(`   • Influential entities: ${insights.influentialEntities}`);
  console.log(`   • Network density: ${(insights.networkDensity * 100).toFixed(2)}%`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    await optimizeIntroductionPaths();
    console.log('\n✅ Introduction path optimization completed successfully');
  } catch (error) {
    console.error('\n❌ Introduction path optimization failed:', error);
    process.exit(1);
  }
}

main();
