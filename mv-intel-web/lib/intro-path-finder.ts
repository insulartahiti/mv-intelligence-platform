interface GraphNode {
  id: string;
  name: string;
  type: string;
  internal_owner?: boolean;
  linkedin_first_degree?: boolean;
  strength_score?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  strength_score: number;
  interaction_count?: number;
  last_interaction_date?: string;
}

interface IntroPath {
  path: string[];
  pathNames: string[];
  strength: number;
  connection_types: string[];
  total_hops: number;
  internal_owners: string[];
  linkedin_connections: string[];
  explanation: string;
}

interface PathFindingOptions {
  maxHops: number;
  maxPaths: number;
  minStrength: number;
  preferLinkedIn: boolean;
  preferInternal: boolean;
}

export class IntroPathFinder {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge[]> = new Map();
  private adjacencyList: Map<string, string[]> = new Map();

  constructor(nodes: GraphNode[], edges: GraphEdge[]) {
    this.buildGraph(nodes, edges);
  }

  private buildGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
    // Build node map
    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }

    // Build edge map and adjacency list
    for (const edge of edges) {
      // Add to edge map
      if (!this.edges.has(edge.source)) {
        this.edges.set(edge.source, []);
      }
      this.edges.get(edge.source)!.push(edge);

      // Add to adjacency list (bidirectional)
      if (!this.adjacencyList.has(edge.source)) {
        this.adjacencyList.set(edge.source, []);
      }
      if (!this.adjacencyList.has(edge.target)) {
        this.adjacencyList.set(edge.target, []);
      }
      
      this.adjacencyList.get(edge.source)!.push(edge.target);
      this.adjacencyList.get(edge.target)!.push(edge.source);
    }
  }

  private calculateEdgeStrength(edge: GraphEdge): number {
    let strength = edge.strength_score || 0.5;
    
    // Boost strength based on interaction count
    if (edge.interaction_count) {
      strength += Math.min(0.3, edge.interaction_count * 0.05);
    }
    
    // Boost strength based on recency
    if (edge.last_interaction_date) {
      const daysSinceInteraction = (Date.now() - new Date(edge.last_interaction_date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceInteraction < 30) {
        strength += 0.2;
      } else if (daysSinceInteraction < 90) {
        strength += 0.1;
      }
    }
    
    return Math.min(1, strength);
  }

  private getEdgeBetween(source: string, target: string): GraphEdge | null {
    const sourceEdges = this.edges.get(source) || [];
    return sourceEdges.find(edge => edge.target === target) || null;
  }

  private findInternalOwners(): string[] {
    return Array.from(this.nodes.values())
      .filter(node => node.internal_owner)
      .map(node => node.id);
  }

  private findLinkedInConnections(): string[] {
    return Array.from(this.nodes.values())
      .filter(node => node.linkedin_first_degree)
      .map(node => node.id);
  }

  private calculatePathStrength(path: string[], connectionTypes: string[]): number {
    if (path.length < 2) return 0;

    let totalStrength = 0;
    let edgeCount = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const edge = this.getEdgeBetween(path[i], path[i + 1]);
      if (edge) {
        totalStrength += this.calculateEdgeStrength(edge);
        edgeCount++;
      }
    }

    return edgeCount > 0 ? totalStrength / edgeCount : 0;
  }

  private generatePathExplanation(path: string[], pathNames: string[], connectionTypes: string[]): string {
    if (path.length < 2) return '';

    const explanations: string[] = [];
    
    for (let i = 0; i < path.length - 1; i++) {
      const currentNode = this.nodes.get(path[i]);
      const nextNode = this.nodes.get(path[i + 1]);
      const edge = this.getEdgeBetween(path[i], path[i + 1]);
      
      if (currentNode && nextNode && edge) {
        const relationship = edge.kind.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        explanations.push(`${pathNames[i]} → ${pathNames[i + 1]} (${relationship})`);
      }
    }

    return explanations.join(' → ');
  }

  private findPathsBFS(
    start: string,
    target: string,
    options: PathFindingOptions
  ): IntroPath[] {
    const paths: IntroPath[] = [];
    const queue: Array<{ path: string[], visited: Set<string> }> = [
      { path: [start], visited: new Set([start]) }
    ];

    while (queue.length > 0 && paths.length < options.maxPaths) {
      const { path, visited } = queue.shift()!;
      const currentNode = path[path.length - 1];

      if (path.length > options.maxHops) continue;

      if (currentNode === target) {
        // Found a path to target
        const pathNames = path.map(nodeId => this.nodes.get(nodeId)?.name || nodeId);
        const connectionTypes: string[] = [];
        
        for (let i = 0; i < path.length - 1; i++) {
          const edge = this.getEdgeBetween(path[i], path[i + 1]);
          if (edge) {
            connectionTypes.push(edge.kind);
          }
        }

        const strength = this.calculatePathStrength(path, connectionTypes);
        
        if (strength >= options.minStrength) {
          const internalOwners = path.filter(nodeId => this.nodes.get(nodeId)?.internal_owner);
          const linkedinConnections = path.filter(nodeId => this.nodes.get(nodeId)?.linkedin_first_degree);
          
          paths.push({
            path: [...path],
            pathNames: [...pathNames],
            strength,
            connection_types: [...connectionTypes],
            total_hops: path.length - 1,
            internal_owners: internalOwners,
            linkedin_connections: linkedinConnections,
            explanation: this.generatePathExplanation(path, pathNames, connectionTypes)
          });
        }
        continue;
      }

      // Explore neighbors
      const neighbors = this.adjacencyList.get(currentNode) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const newVisited = new Set(visited);
          newVisited.add(neighbor);
          queue.push({ path: [...path, neighbor], visited: newVisited });
        }
      }
    }

    return paths;
  }

  private findPathsDijkstra(
    start: string,
    target: string,
    options: PathFindingOptions
  ): IntroPath[] {
    const paths: IntroPath[] = [];
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const visited = new Set<string>();
    
    // Initialize distances
    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, Infinity);
      previous.set(nodeId, null);
    }
    distances.set(start, 0);

    // Priority queue (simple implementation)
    const queue: Array<{ nodeId: string, distance: number }> = [
      { nodeId: start, distance: 0 }
    ];

    while (queue.length > 0) {
      // Sort by distance (simple priority queue)
      queue.sort((a, b) => a.distance - b.distance);
      const { nodeId, distance } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      if (nodeId === target) {
        // Reconstruct path
        const path: string[] = [];
        let current: string | null = target;
        
        while (current !== null) {
          path.unshift(current);
          current = previous.get(current) || null;
        }

        if (path.length > 1) {
          const pathNames = path.map(nodeId => this.nodes.get(nodeId)?.name || nodeId);
          const connectionTypes: string[] = [];
          
          for (let i = 0; i < path.length - 1; i++) {
            const edge = this.getEdgeBetween(path[i], path[i + 1]);
            if (edge) {
              connectionTypes.push(edge.kind);
            }
          }

          const strength = this.calculatePathStrength(path, connectionTypes);
          
          if (strength >= options.minStrength) {
            const internalOwners = path.filter(nodeId => this.nodes.get(nodeId)?.internal_owner);
            const linkedinConnections = path.filter(nodeId => this.nodes.get(nodeId)?.linkedin_first_degree);
            
            paths.push({
              path: [...path],
              pathNames: [...pathNames],
              strength,
              connection_types: [...connectionTypes],
              total_hops: path.length - 1,
              internal_owners: internalOwners,
              linkedin_connections: linkedinConnections,
              explanation: this.generatePathExplanation(path, pathNames, connectionTypes)
            });
          }
        }
        break;
      }

      // Explore neighbors
      const neighbors = this.adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;

        const edge = this.getEdgeBetween(nodeId, neighbor);
        if (!edge) continue;

        const edgeStrength = this.calculateEdgeStrength(edge);
        const newDistance = distance + (1 - edgeStrength); // Lower strength = higher distance

        if (newDistance < (distances.get(neighbor) || Infinity)) {
          distances.set(neighbor, newDistance);
          previous.set(neighbor, nodeId);
          queue.push({ nodeId: neighbor, distance: newDistance });
        }
      }
    }

    return paths;
  }

  findIntroPaths(
    targetId: string,
    options: Partial<PathFindingOptions> = {}
  ): IntroPath[] {
    const defaultOptions: PathFindingOptions = {
      maxHops: 4,
      maxPaths: 10,
      minStrength: 0.3,
      preferLinkedIn: true,
      preferInternal: true
    };

    const finalOptions = { ...defaultOptions, ...options };
    const internalOwners = this.findInternalOwners();
    const linkedinConnections = this.findLinkedInConnections();

    if (internalOwners.length === 0) {
      console.warn('No internal owners found in the graph');
      return [];
    }

    const allPaths: IntroPath[] = [];

    // Find paths from each internal owner
    for (const internalOwner of internalOwners) {
      if (internalOwner === targetId) continue;

      // Try BFS first for shorter paths
      const bfsPaths = this.findPathsBFS(internalOwner, targetId, finalOptions);
      allPaths.push(...bfsPaths);

      // If we need more paths, try Dijkstra
      if (allPaths.length < finalOptions.maxPaths) {
        const dijkstraPaths = this.findPathsDijkstra(internalOwner, targetId, finalOptions);
        allPaths.push(...dijkstraPaths);
      }
    }

    // Remove duplicates and sort by strength
    const uniquePaths = this.removeDuplicatePaths(allPaths);
    const sortedPaths = uniquePaths
      .sort((a, b) => {
        // Prioritize paths with LinkedIn connections
        if (finalOptions.preferLinkedIn) {
          const aLinkedIn = a.linkedin_connections.length;
          const bLinkedIn = b.linkedin_connections.length;
          if (aLinkedIn !== bLinkedIn) {
            return bLinkedIn - aLinkedIn;
          }
        }

        // Then by strength
        return b.strength - a.strength;
      })
      .slice(0, finalOptions.maxPaths);

    return sortedPaths;
  }

  private removeDuplicatePaths(paths: IntroPath[]): IntroPath[] {
    const seen = new Set<string>();
    const unique: IntroPath[] = [];

    for (const path of paths) {
      const pathKey = path.path.join('→');
      if (!seen.has(pathKey)) {
        seen.add(pathKey);
        unique.push(path);
      }
    }

    return unique;
  }

  findPathsBetween(sourceId: string, targetId: string, options: Partial<PathFindingOptions> = {}): IntroPath[] {
    const defaultOptions: PathFindingOptions = {
      maxHops: 6,
      maxPaths: 5,
      minStrength: 0.2,
      preferLinkedIn: false,
      preferInternal: false
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    const paths = this.findPathsBFS(sourceId, targetId, finalOptions);
    return paths
      .sort((a, b) => b.strength - a.strength)
      .slice(0, finalOptions.maxPaths);
  }

  getPathInsights(paths: IntroPath[]): {
    totalPaths: number;
    averageStrength: number;
    shortestPath: number;
    longestPath: number;
    linkedinPaths: number;
    internalOwnerPaths: number;
    topConnectionTypes: Array<{ type: string; count: number }>;
  } {
    if (paths.length === 0) {
      return {
        totalPaths: 0,
        averageStrength: 0,
        shortestPath: 0,
        longestPath: 0,
        linkedinPaths: 0,
        internalOwnerPaths: 0,
        topConnectionTypes: []
      };
    }

    const strengths = paths.map(p => p.strength);
    const hopCounts = paths.map(p => p.total_hops);
    const linkedinPaths = paths.filter(p => p.linkedin_connections.length > 0).length;
    const internalOwnerPaths = paths.filter(p => p.internal_owners.length > 0).length;

    // Count connection types
    const connectionTypeCount = new Map<string, number>();
    for (const path of paths) {
      for (const type of path.connection_types) {
        connectionTypeCount.set(type, (connectionTypeCount.get(type) || 0) + 1);
      }
    }

    const topConnectionTypes = Array.from(connectionTypeCount.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalPaths: paths.length,
      averageStrength: strengths.reduce((a, b) => a + b, 0) / strengths.length,
      shortestPath: Math.min(...hopCounts),
      longestPath: Math.max(...hopCounts),
      linkedinPaths,
      internalOwnerPaths,
      topConnectionTypes
    };
  }
}

export default IntroPathFinder;
