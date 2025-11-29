require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Enhanced Path Finder - Intelligent connection discovery
 * 
 * This system uses multiple algorithms and relationship weights
 * to find the best connection paths between entities.
 */

class EnhancedPathFinder {
  constructor() {
    this.relationshipWeights = {
      'founder': 0.95,
      'ceo': 0.90,
      'cto': 0.85,
      'cfo': 0.85,
      'director': 0.80,
      'manager': 0.75,
      'employee': 0.70,
      'colleague': 0.65,
      'portfolio': 0.90,
      'deal_team': 0.80,
      'owner': 0.85
    };
    
    this.maxDepth = 6;
    this.maxPaths = 10;
    this.cache = new Map();
  }

  /**
   * Find multiple connection paths with intelligent scoring
   */
  async findConnectionPaths(startId, targetId, options = {}) {
    const cacheKey = `${startId}-${targetId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    console.log(`🔍 Finding paths from ${startId} to ${targetId}...`);

    try {
      // Get entity names for better logging
      const { data: startEntity } = await supabase
        .schema('graph')
        .from('entities')
        .select('name, type')
        .eq('id', startId)
        .single();

      const { data: targetEntity } = await supabase
        .schema('graph')
        .from('entities')
        .select('name, type')
        .eq('id', targetId)
        .single();

      console.log(`   From: ${startEntity?.name || startId} (${startEntity?.type || 'unknown'})`);
      console.log(`   To: ${targetEntity?.name || targetId} (${targetEntity?.type || 'unknown'})`);

      // Try multiple path-finding strategies
      const strategies = [
        () => this.findShortestPath(startId, targetId),
        () => this.findStrongestPath(startId, targetId),
        () => this.findMultiplePaths(startId, targetId),
        () => this.findIndirectPaths(startId, targetId)
      ];

      const allPaths = [];
      for (const strategy of strategies) {
        try {
          const paths = await strategy();
          allPaths.push(...paths);
        } catch (error) {
          console.log(`   Strategy failed: ${error.message}`);
        }
      }

      // Remove duplicates and sort by score
      const uniquePaths = this.deduplicatePaths(allPaths);
      const scoredPaths = this.scorePaths(uniquePaths);
      const topPaths = scoredPaths.slice(0, this.maxPaths);

      console.log(`   Found ${topPaths.length} connection paths`);
      topPaths.forEach((path, i) => {
        console.log(`     ${i+1}. Score: ${path.score.toFixed(2)} - ${path.description}`);
      });

      this.cache.set(cacheKey, topPaths);
      return topPaths;

    } catch (error) {
      console.error(`   ❌ Path finding error: ${error.message}`);
      return [];
    }
  }

  /**
   * Find shortest path using BFS
   */
  async findShortestPath(startId, targetId) {
    const visited = new Set();
    const queue = [{ id: startId, path: [startId], depth: 0 }];
    visited.add(startId);

    while (queue.length > 0) {
      const { id, path, depth } = queue.shift();

      if (depth > this.maxDepth) continue;

      if (id === targetId) {
        return [{
          path: path,
          score: this.calculatePathScore(path),
          description: this.generatePathDescription(path),
          strategy: 'shortest'
        }];
      }

      const edges = await this.getConnectedEdges(id);
      for (const edge of edges) {
        const nextId = edge.source === id ? edge.target : edge.source;
        
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ 
            id: nextId, 
            path: [...path, nextId], 
            depth: depth + 1 
          });
        }
      }
    }

    return [];
  }

  /**
   * Find strongest path using weighted graph
   */
  async findStrongestPath(startId, targetId) {
    const visited = new Set();
    const queue = [{ id: startId, path: [startId], totalWeight: 0 }];
    visited.add(startId);

    while (queue.length > 0) {
      // Sort by total weight (highest first)
      queue.sort((a, b) => b.totalWeight - a.totalWeight);
      const { id, path, totalWeight } = queue.shift();

      if (id === targetId) {
        return [{
          path: path,
          score: totalWeight,
          description: this.generatePathDescription(path),
          strategy: 'strongest'
        }];
      }

      const edges = await this.getConnectedEdges(id);
      for (const edge of edges) {
        const nextId = edge.source === id ? edge.target : edge.source;
        
        if (!visited.has(nextId)) {
          visited.add(nextId);
          const edgeWeight = this.getEdgeWeight(edge);
          queue.push({ 
            id: nextId, 
            path: [...path, nextId], 
            totalWeight: totalWeight + edgeWeight 
          });
        }
      }
    }

    return [];
  }

  /**
   * Find multiple paths using different approaches
   */
  async findMultiplePaths(startId, targetId) {
    const paths = [];
    const visited = new Set();
    
    // Try different starting points (people with high connectivity)
    const { data: highConnectivityPeople } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('type', 'person')
      .limit(5);

    for (const person of highConnectivityPeople || []) {
      if (person.id === startId || person.id === targetId) continue;
      
      try {
        const path1 = await this.findShortestPath(startId, person.id);
        const path2 = await this.findShortestPath(person.id, targetId);
        
        if (path1.length > 0 && path2.length > 0) {
          const combinedPath = {
            path: [...path1[0].path, ...path2[0].path.slice(1)],
            score: (path1[0].score + path2[0].score) / 2,
            description: `Through ${person.name}`,
            strategy: 'multi-hop'
          };
          paths.push(combinedPath);
        }
      } catch (error) {
        // Skip this person
      }
    }

    return paths;
  }

  /**
   * Find indirect paths through organizations
   */
  async findIndirectPaths(startId, targetId) {
    const paths = [];
    
    // Find organizations connected to start
    const startOrgs = await this.getConnectedOrganizations(startId);
    const targetOrgs = await this.getConnectedOrganizations(targetId);
    
    // Find common organizations
    const commonOrgs = startOrgs.filter(org => 
      targetOrgs.some(targetOrg => targetOrg.id === org.id)
    );
    
    for (const org of commonOrgs) {
      try {
        const path1 = await this.findShortestPath(startId, org.id);
        const path2 = await this.findShortestPath(org.id, targetId);
        
        if (path1.length > 0 && path2.length > 0) {
          const combinedPath = {
            path: [...path1[0].path, ...path2[0].path.slice(1)],
            score: (path1[0].score + path2[0].score) / 2,
            description: `Through ${org.name}`,
            strategy: 'organization'
          };
          paths.push(combinedPath);
        }
      } catch (error) {
        // Skip this organization
      }
    }
    
    return paths;
  }

  /**
   * Get connected edges for an entity
   */
  async getConnectedEdges(entityId) {
    const { data: edges } = await supabase
      .schema('graph')
      .from('edges')
      .select('source, target, kind, strength_score')
      .or(`source.eq.${entityId},target.eq.${entityId}`)
      .limit(20);

    return edges || [];
  }

  /**
   * Get connected organizations for an entity
   */
  async getConnectedOrganizations(entityId) {
    const edges = await this.getConnectedEdges(entityId);
    const orgIds = edges.map(edge => 
      edge.source === entityId ? edge.target : edge.source
    );

    if (orgIds.length === 0) return [];

    const { data: orgs } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type')
      .in('id', orgIds)
      .eq('type', 'organization');

    return orgs || [];
  }

  /**
   * Calculate path score based on relationship weights
   */
  calculatePathScore(path) {
    if (path.length < 2) return 0;
    
    let totalScore = 0;
    for (let i = 0; i < path.length - 1; i++) {
      // This is a simplified calculation - in practice, you'd query edge weights
      totalScore += 0.8; // Default edge weight
    }
    
    // Bonus for shorter paths
    const lengthBonus = Math.max(0, 1 - (path.length - 2) * 0.1);
    return totalScore * lengthBonus;
  }

  /**
   * Score paths using multiple criteria
   */
  scorePaths(paths) {
    return paths.map(path => {
      let score = path.score || 0;
      
      // Bonus for shorter paths
      if (path.path.length <= 3) score += 0.2;
      
      // Bonus for specific relationship types
      if (path.description.includes('founder') || path.description.includes('CEO')) {
        score += 0.3;
      }
      
      // Penalty for very long paths
      if (path.path.length > 5) score *= 0.5;
      
      return { ...path, score };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Remove duplicate paths
   */
  deduplicatePaths(paths) {
    const seen = new Set();
    return paths.filter(path => {
      const key = path.path.join('-');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Generate human-readable path description
   */
  generatePathDescription(path) {
    if (path.length === 2) {
      return 'Direct connection';
    } else if (path.length === 3) {
      return 'One degree of separation';
    } else {
      return `${path.length - 2} degrees of separation`;
    }
  }

  /**
   * Get edge weight based on relationship type
   */
  getEdgeWeight(edge) {
    const baseWeight = edge.strength_score || 0.5;
    const typeWeight = this.relationshipWeights[edge.kind] || 0.5;
    return (baseWeight + typeWeight) / 2;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = { EnhancedPathFinder };




