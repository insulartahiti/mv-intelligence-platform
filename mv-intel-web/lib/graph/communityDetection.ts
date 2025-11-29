// Enhanced Knowledge Graph Intelligence - Community Detection
// Use graphology to detect communities for semantic clustering

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';
import { cosineSimilarity } from './utils';

export interface Entity {
  id: string;
  name: string;
  type: string;
  embedding?: number[];
  metadata?: any;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength_score?: number;
}

export interface Community {
  id: number;
  entities: string[];
  size: number;
  avgSimilarity: number;
  dominantType: string;
  representativeEntity: string;
}

/**
 * Detect communities using Louvain algorithm
 */
export async function detectCommunities(
  entities: Entity[],
  edges: Edge[]
): Promise<Map<string, number>> {
  // Build graph
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  edges.forEach(e => {
    if (!graph.hasEdge(e.source, e.target)) {
      graph.addEdge(e.source, e.target, { 
        weight: e.strength_score || 0.5 
      });
    }
  });
  
  // Run Louvain community detection
  const communities = louvain(graph, {
    resolution: 1.0
  });
  
  return new Map(Object.entries(communities));
}

/**
 * Detect semantic communities based on embedding similarity
 */
export async function detectSemanticCommunities(
  entities: Entity[],
  similarityThreshold: number = 0.7
): Promise<Map<string, number>> {
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  
  // Create edges based on embedding similarity
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (entities[i].embedding && entities[j].embedding) {
        const similarity = cosineSimilarity(
          entities[i].embedding!,
          entities[j].embedding!
        );
        
        // Only connect if highly similar
        if (similarity > similarityThreshold) {
          graph.addEdge(entities[i].id, entities[j].id, {
            weight: similarity
          });
        }
      }
    }
  }
  
  return new Map(Object.entries(louvain(graph)));
}

/**
 * Detect hybrid communities using both graph structure and semantic similarity
 */
export async function detectHybridCommunities(
  entities: Entity[],
  edges: Edge[],
  structureWeight: number = 0.6,
  semanticWeight: number = 0.4,
  similarityThreshold: number = 0.6
): Promise<Map<string, number>> {
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  
  // Add structural edges
  edges.forEach(e => {
    if (!graph.hasEdge(e.source, e.target)) {
      graph.addEdge(e.source, e.target, { 
        weight: (e.strength_score || 0.5) * structureWeight,
        type: 'structural'
      });
    }
  });
  
  // Add semantic edges
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (entities[i].embedding && entities[j].embedding) {
        const similarity = cosineSimilarity(
          entities[i].embedding!,
          entities[j].embedding!
        );
        
        if (similarity > similarityThreshold) {
          const existingEdge = graph.edge(entities[i].id, entities[j].id);
          if (existingEdge) {
            // Combine weights
            const currentWeight = graph.getEdgeAttribute(existingEdge, 'weight');
            graph.setEdgeAttribute(existingEdge, 'weight', 
              currentWeight + (similarity * semanticWeight));
          } else {
            graph.addEdge(entities[i].id, entities[j].id, {
              weight: similarity * semanticWeight,
              type: 'semantic'
            });
          }
        }
      }
    }
  }
  
  return new Map(Object.entries(louvain(graph)));
}

/**
 * Analyze community characteristics
 */
export function analyzeCommunities(
  entities: Entity[],
  communityMap: Map<string, number>
): Community[] {
  const communities = new Map<number, string[]>();
  
  // Group entities by community
  communityMap.forEach((communityId, entityId) => {
    if (!communities.has(communityId)) {
      communities.set(communityId, []);
    }
    communities.get(communityId)!.push(entityId);
  });
  
  // Analyze each community
  return Array.from(communities.entries()).map(([communityId, entityIds]) => {
    const communityEntities = entityIds.map(id => 
      entities.find(e => e.id === id)!
    );
    
    // Calculate average similarity within community
    let totalSimilarity = 0;
    let similarityCount = 0;
    
    for (let i = 0; i < communityEntities.length; i++) {
      for (let j = i + 1; j < communityEntities.length; j++) {
        if (communityEntities[i].embedding && communityEntities[j].embedding) {
          totalSimilarity += cosineSimilarity(
            communityEntities[i].embedding!,
            communityEntities[j].embedding!
          );
          similarityCount++;
        }
      }
    }
    
    const avgSimilarity = similarityCount > 0 ? totalSimilarity / similarityCount : 0;
    
    // Find dominant entity type
    const typeCounts = new Map<string, number>();
    communityEntities.forEach(e => {
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
    });
    
    const dominantType = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    
    // Find representative entity (highest importance or most connected)
    const representativeEntity = communityEntities
      .sort((a, b) => (b.metadata?.importance || 0) - (a.metadata?.importance || 0))[0];
    
    return {
      id: communityId,
      entities: entityIds,
      size: entityIds.length,
      avgSimilarity,
      dominantType,
      representativeEntity: representativeEntity?.name || entityIds[0]
    };
  }).sort((a, b) => b.size - a.size);
}

/**
 * Detect communities with different resolutions
 */
export async function detectCommunitiesMultiResolution(
  entities: Entity[],
  edges: Edge[],
  resolutions: number[] = [0.5, 1.0, 1.5, 2.0]
): Promise<Map<number, Map<string, number>>> {
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  edges.forEach(e => {
    if (!graph.hasEdge(e.source, e.target)) {
      graph.addEdge(e.source, e.target, { 
        weight: e.strength_score || 0.5 
      });
    }
  });
  
  const results = new Map<number, Map<string, number>>();
  
  for (const resolution of resolutions) {
    const communities = louvain(graph, {
      resolution
    });
    
    results.set(resolution, new Map(Object.entries(communities)));
  }
  
  return results;
}

/**
 * Find optimal community resolution based on modularity
 */
export async function findOptimalResolution(
  entities: Entity[],
  edges: Edge[],
  resolutionRange: [number, number] = [0.1, 3.0],
  step: number = 0.1
): Promise<{ resolution: number; modularity: number; communities: Map<string, number> }> {
  const graph = new Graph({ type: 'undirected' });
  
  entities.forEach(e => graph.addNode(e.id, { ...e }));
  edges.forEach(e => {
    if (!graph.hasEdge(e.source, e.target)) {
      graph.addEdge(e.source, e.target, { 
        weight: e.strength_score || 0.5 
      });
    }
  });
  
  let bestResolution = 1.0;
  let bestModularity = -1;
  let bestCommunities = new Map<string, number>();
  
  for (let resolution = resolutionRange[0]; resolution <= resolutionRange[1]; resolution += step) {
    const communities = louvain(graph, {
      resolution
    });
    
    // Calculate modularity (simplified)
    const modularity = calculateModularity(graph, communities);
    
    if (modularity > bestModularity) {
      bestModularity = modularity;
      bestResolution = resolution;
      bestCommunities = new Map(Object.entries(communities));
    }
  }
  
  return {
    resolution: bestResolution,
    modularity: bestModularity,
    communities: bestCommunities
  };
}

/**
 * Calculate modularity for community quality assessment
 */
function calculateModularity(graph: Graph, communities: Record<string, number>): number {
  const m = graph.size;
  if (m === 0) return 0;
  
  let modularity = 0;
  const communityMap = new Map(Object.entries(communities));
  
  // Calculate modularity for each community
  const communitySizes = new Map<number, number>();
  communityMap.forEach(communityId => {
    communitySizes.set(communityId, (communitySizes.get(communityId) || 0) + 1);
  });
  
  communitySizes.forEach((size, communityId) => {
    const communityEntities = Array.from(communityMap.entries())
      .filter(([_, cid]) => cid === communityId)
      .map(([entityId, _]) => entityId);
    
    let internalEdges = 0;
    let totalDegree = 0;
    
    communityEntities.forEach(entityId => {
      const degree = graph.degree(entityId);
      totalDegree += degree;
      
      graph.forEachNeighbor(entityId, neighborId => {
        if (communityMap.get(neighborId) === communityId) {
          internalEdges++;
        }
      });
    });
    
    const expectedEdges = (totalDegree * totalDegree) / (2 * m);
    modularity += (internalEdges / 2) - expectedEdges;
  });
  
  return modularity / m;
}

/**
 * Get community color palette for visualization
 */
export function getCommunityColors(communityCount: number): string[] {
  const baseColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
  ];
  
  const colors: string[] = [];
  for (let i = 0; i < communityCount; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  
  return colors;
}
