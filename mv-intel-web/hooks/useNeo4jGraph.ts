'use client';

import { useState, useCallback } from 'react';

type GraphNode = {
  id: string;
  label: string;
  type: string;
  color?: string;
  internal_owner?: boolean;
  size?: number;
  industry?: string;
  title?: string;
  domain?: string;
  linkedin_first_degree?: boolean;
  affinity_strength?: number;
  pipeline_stage?: string;
  fund?: string;
  is_internal?: boolean;
  is_portfolio?: boolean;
  is_pipeline?: boolean;
  importance?: number;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight?: number;
  strength_score?: number;
  interaction_count?: number;
};

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta?: {
    totalNodes: number;
    totalEdges: number;
    filters: any;
  };
};

type UseNeo4jGraphReturn = {
  graphData: GraphData | null;
  loading: boolean;
  error: string | null;
  loadGraph: (mode: string, limit?: number) => Promise<void>;
  loadAroundNode: (nodeId: string, limit?: number) => Promise<void>;
  refresh: () => Promise<void>;
  stats: any;
};

export function useNeo4jGraph(): UseNeo4jGraphReturn {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const loadGraph = useCallback(async (mode: string, limit: number = 1000) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Loading graph data: mode=${mode}, limit=${limit}`);
      
      // Map mode to API parameters
      let url = `/api/neo4j/progressive-load?mode=${mode}&limit=${limit}`;
      
      // Add specific filters based on mode
      switch (mode) {
        case 'high-importance':
          url += '&minImportance=0.7';
          break;
        case 'internal':
          url += '&internal=true';
          break;
        case 'portfolio':
          url += '&type=organization&internal=false';
          break;
        case 'overview':
        default:
          // No additional filters
          break;
      }
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to load graph data');
      }
      
      if (result.success) {
        setGraphData(result.data);
        setStats(result.meta);
        console.log(`Loaded ${result.data.nodes.length} nodes and ${result.data.edges.length} edges`);
      } else {
        throw new Error(result.message || 'Failed to load graph data');
      }
    } catch (err: any) {
      console.error('Error loading graph data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAroundNode = useCallback(async (nodeId: string, limit: number = 500) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Loading data around node: ${nodeId}, limit=${limit}`);
      
      const response = await fetch(`/api/neo4j/progressive-load?mode=around&nodeId=${nodeId}&limit=${limit}`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to load node data');
      }
      
      if (result.success) {
        // Merge with existing data or replace
        setGraphData(prevData => {
          if (!prevData) return result.data;
          
          // Merge nodes (avoid duplicates)
          const existingNodeIds = new Set(prevData.nodes.map((n: any) => n.id));
          const newNodes = result.data.nodes.filter((n: any) => !existingNodeIds.has(n.id));
          
          // Merge edges (avoid duplicates)
          const existingEdgeIds = new Set(prevData.edges.map((e: any) => e.id));
          const newEdges = result.data.edges.filter((e: any) => !existingEdgeIds.has(e.id));
          
          return {
            nodes: [...prevData.nodes, ...newNodes],
            edges: [...prevData.edges, ...newEdges],
            meta: result.data.meta
          };
        });
        
        console.log(`Added ${result.data.nodes.length} nodes and ${result.data.edges.length} edges around node ${nodeId}`);
      } else {
        throw new Error(result.message || 'Failed to load node data');
      }
    } catch (err: any) {
      console.error('Error loading node data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (graphData) {
      // Reload with current parameters
      await loadGraph('overview', 1000);
    }
  }, [graphData, loadGraph]);

  return {
    graphData,
    loading,
    error,
    loadGraph,
    loadAroundNode,
    refresh,
    stats
  };
}