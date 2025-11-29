// Enhanced Knowledge Graph Intelligence - Centrality Metrics
// Implement key centrality measures using graphology

import Graph from 'graphology';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import degreeCentrality from 'graphology-metrics/centrality/degree';
import closenessCentrality from 'graphology-metrics/centrality/closeness';
import eigenvectorCentrality from 'graphology-metrics/centrality/eigenvector';

export interface Entity {
  id: string;
  name: string;
  type: string;
  metadata?: any;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength_score?: number;
}

export interface CentralityMetrics {
  entityId: string;
  degree: number;
  betweenness: number;
  closeness: number;
  eigenvector: number;
  influence: number; // Combined score
  rank: number;
}

export interface InfluenceAnalysis {
  topInfluencers: CentralityMetrics[];
  networkHubs: CentralityMetrics[];
  bridges: CentralityMetrics[];
  isolated: CentralityMetrics[];
  networkStats: {
    totalNodes: number;
    totalEdges: number;
    avgDegree: number;
    networkDensity: number;
    clusteringCoefficient: number;
  };
}

/**
 * Calculate comprehensive centrality metrics for all entities
 */
export function calculateCentralityMetrics(
  entities: Entity[],
  edges: Edge[]
): CentralityMetrics[] {
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  edges.forEach(e => graph.addEdge(e.source, e.target, {
    weight: e.strength_score || 0.5
  }));
  
  // Calculate basic centrality measures (simplified for now)
  const degreeScores: Record<string, number> = {};
  const betweennessScores: Record<string, number> = {};
  const closenessScores: Record<string, number> = {};
  const eigenvectorScores: Record<string, number> = {};
  
  // Basic degree centrality calculation
  entities.forEach(entity => {
    const degree = graph.degree(entity.id);
    degreeScores[entity.id] = degree;
    betweennessScores[entity.id] = 0; // Simplified for now
    closenessScores[entity.id] = 0; // Simplified for now
    eigenvectorScores[entity.id] = 0; // Simplified for now
  });
  
  // Normalize scores to 0-1 range
  const maxDegree = Math.max(...Object.values(degreeScores));
  const maxBetweenness = 1; // Simplified
  const maxCloseness = 1; // Simplified
  const maxEigenvector = 1; // Simplified
  
  const metrics: CentralityMetrics[] = entities.map(e => {
    const degree = (degreeScores[e.id] || 0) / Math.max(maxDegree, 1);
    const betweenness = (betweennessScores[e.id] || 0) / Math.max(maxBetweenness, 1);
    const closeness = (closenessScores[e.id] || 0) / Math.max(maxCloseness, 1);
    const eigenvector = (eigenvectorScores[e.id] || 0) / Math.max(maxEigenvector, 1);
    
    // Combined influence score with weighted combination
    const influence = (
      degree * 0.3 +           // Direct connections
      betweenness * 0.25 +     // Bridge importance
      closeness * 0.2 +        // Reachability
      eigenvector * 0.15 +     // Connection quality
      (e.metadata?.importance || 0.5) * 0.1 // Entity importance
    );
    
    return {
      entityId: e.id,
      degree: degreeScores[e.id] || 0,
      betweenness: betweennessScores[e.id] || 0,
      closeness: closenessScores[e.id] || 0,
      eigenvector: eigenvectorScores[e.id] || 0,
      influence,
      rank: 0 // Will be set after sorting
    };
  });
  
  // Sort by influence and assign ranks
  metrics.sort((a, b) => b.influence - a.influence);
  metrics.forEach((metric, index) => {
    metric.rank = index + 1;
  });
  
  return metrics;
}

/**
 * Analyze network structure and identify key entities
 */
export function analyzeNetworkInfluence(
  entities: Entity[],
  edges: Edge[]
): InfluenceAnalysis {
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  edges.forEach(e => graph.addEdge(e.source, e.target, {
    weight: e.strength_score || 0.5
  }));
  
  const centralityMetrics = calculateCentralityMetrics(entities, edges);
  
  // Identify different types of influential entities
  const topInfluencers = centralityMetrics
    .filter(m => m.rank <= 10)
    .slice(0, 10);
  
  const networkHubs = centralityMetrics
    .filter(m => m.degree >= 5) // High degree threshold
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 20);
  
  const bridges = centralityMetrics
    .filter(m => m.betweenness > 0) // Only entities that act as bridges
    .sort((a, b) => b.betweenness - a.betweenness)
    .slice(0, 15);
  
  const isolated = centralityMetrics
    .filter(m => m.degree === 0)
    .slice(0, 10);
  
  // Calculate network statistics
  const totalNodes = graph.order;
  const totalEdges = graph.size;
  const avgDegree = totalEdges > 0 ? (2 * totalEdges) / totalNodes : 0;
  const networkDensity = totalNodes > 1 ? (2 * totalEdges) / (totalNodes * (totalNodes - 1)) : 0;
  
  // Calculate clustering coefficient (simplified)
  const clusteringCoefficient = calculateClusteringCoefficient(graph);
  
  return {
    topInfluencers,
    networkHubs,
    bridges,
    isolated,
    networkStats: {
      totalNodes,
      totalEdges,
      avgDegree,
      networkDensity,
      clusteringCoefficient
    }
  };
}

/**
 * Calculate clustering coefficient for the network
 */
function calculateClusteringCoefficient(graph: Graph): number {
  let totalClustering = 0;
  let nodeCount = 0;
  
  graph.forEachNode(nodeId => {
    const neighbors = graph.neighbors(nodeId);
    const neighborCount = neighbors.length;
    
    if (neighborCount >= 2) {
      let connectedPairs = 0;
      let totalPairs = (neighborCount * (neighborCount - 1)) / 2;
      
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (graph.hasEdge(neighbors[i], neighbors[j])) {
            connectedPairs++;
          }
        }
      }
      
      totalClustering += connectedPairs / totalPairs;
      nodeCount++;
    }
  });
  
  return nodeCount > 0 ? totalClustering / nodeCount : 0;
}

/**
 * Find entities with specific centrality patterns
 */
export function findCentralityPatterns(
  centralityMetrics: CentralityMetrics[]
): {
  highDegreeLowBetweenness: CentralityMetrics[];
  highBetweennessLowDegree: CentralityMetrics[];
  balancedInfluence: CentralityMetrics[];
  emergingInfluencers: CentralityMetrics[];
} {
  const highDegreeLowBetweenness = centralityMetrics
    .filter(m => m.degree > 5 && m.betweenness < 2)
    .sort((a, b) => b.degree - a.degree);
  
  const highBetweennessLowDegree = centralityMetrics
    .filter(m => m.betweenness > 2 && m.degree < 5)
    .sort((a, b) => b.betweenness - a.betweenness);
  
  const balancedInfluence = centralityMetrics
    .filter(m => {
      const degreeRank = centralityMetrics.filter(c => c.degree > m.degree).length;
      const betweennessRank = centralityMetrics.filter(c => c.betweenness > m.betweenness).length;
      const totalRank = centralityMetrics.length;
      
      // Balanced if both metrics are in similar percentile ranges
      const degreePercentile = degreeRank / totalRank;
      const betweennessPercentile = betweennessRank / totalRank;
      
      return Math.abs(degreePercentile - betweennessPercentile) < 0.2;
    })
    .sort((a, b) => b.influence - a.influence);
  
  const emergingInfluencers = centralityMetrics
    .filter(m => m.rank > 10 && m.rank <= 50 && m.influence > 0.3)
    .sort((a, b) => b.influence - a.influence);
  
  return {
    highDegreeLowBetweenness,
    highBetweennessLowDegree,
    balancedInfluence,
    emergingInfluencers
  };
}

/**
 * Calculate influence spread for specific entities
 */
export function calculateInfluenceSpread(
  entityId: string,
  entities: Entity[],
  edges: Edge[],
  maxDepth: number = 3
): {
  directInfluence: number;
  indirectInfluence: number;
  reachableEntities: string[];
  influencePath: Map<string, number>;
} {
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  edges.forEach(e => graph.addEdge(e.source, e.target, {
    weight: e.strength_score || 0.5
  }));
  
  const visited = new Set<string>();
  const influencePath = new Map<string, number>();
  const queue: Array<{ nodeId: string; depth: number; influence: number }> = [
    { nodeId: entityId, depth: 0, influence: 1.0 }
  ];
  
  let directInfluence = 0;
  let indirectInfluence = 0;
  const reachableEntities: string[] = [];
  
  while (queue.length > 0) {
    const { nodeId, depth, influence } = queue.shift()!;
    
    if (visited.has(nodeId) || depth > maxDepth) continue;
    
    visited.add(nodeId);
    reachableEntities.push(nodeId);
    influencePath.set(nodeId, influence);
    
    if (depth === 1) {
      directInfluence += influence;
    } else if (depth > 1) {
      indirectInfluence += influence;
    }
    
    // Add neighbors to queue
    graph.forEachNeighbor(nodeId, neighborId => {
      if (!visited.has(neighborId)) {
        const edgeWeight = graph.getEdgeAttribute(
          graph.edge(nodeId, neighborId),
          'weight'
        ) || 0.5;
        
        queue.push({
          nodeId: neighborId,
          depth: depth + 1,
          influence: influence * edgeWeight * 0.8 // Decay factor
        });
      }
    });
  }
  
  return {
    directInfluence,
    indirectInfluence,
    reachableEntities,
    influencePath
  };
}

/**
 * Get centrality visualization data
 */
export function getCentralityVisualizationData(
  centralityMetrics: CentralityMetrics[],
  entities: Entity[]
): {
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    centrality: number;
    rank: number;
    size: number;
    color: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
} {
  const maxInfluence = Math.max(...centralityMetrics.map(m => m.influence));
  const minInfluence = Math.min(...centralityMetrics.map(m => m.influence));
  
  const nodes = centralityMetrics.map(metric => {
    const entity = entities.find(e => e.id === metric.entityId)!;
    const normalizedInfluence = (metric.influence - minInfluence) / (maxInfluence - minInfluence);
    
    return {
      id: metric.entityId,
      name: entity.name,
      type: entity.type,
      centrality: metric.influence,
      rank: metric.rank,
      size: Math.max(5, 5 + normalizedInfluence * 15), // Size based on influence
      color: getCentralityColor(metric.rank, centralityMetrics.length)
    };
  });
  
  return {
    nodes,
    edges: [] // Edges would be added separately
  };
}

/**
 * Get color based on centrality rank
 */
function getCentralityColor(rank: number, totalEntities: number): string {
  const percentile = rank / totalEntities;
  
  if (percentile <= 0.1) return '#FF4444'; // Top 10% - Red
  if (percentile <= 0.25) return '#FF8800'; // Top 25% - Orange
  if (percentile <= 0.5) return '#FFDD00'; // Top 50% - Yellow
  if (percentile <= 0.75) return '#88FF88'; // Top 75% - Light Green
  return '#CCCCCC'; // Bottom 25% - Gray
}
