import { useState, useCallback, useRef } from 'react';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  domain?: string;
  industry?: string;
  pipeline_stage?: string;
  fund?: string;
  taxonomy?: string;
  is_internal?: boolean;
  is_portfolio?: boolean;
  is_pipeline?: boolean;
  importance?: number;
  size: number;
  connection_count: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hasMore: boolean;
  totalAvailable: number;
}

interface UseProgressiveGraphReturn {
  graphData: GraphData | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  totalAvailable: number;
  loadInitialGraph: (mode: string, maxNodes?: number) => Promise<void>;
  expandNode: (nodeId: string, maxNodes?: number) => Promise<void>;
  resetGraph: () => void;
  isLoadingMore: boolean;
}

export function useProgressiveGraph(): UseProgressiveGraphReturn {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalAvailable, setTotalAvailable] = useState(0);
  
  // Keep track of loaded node IDs to avoid duplicates
  const loadedNodeIds = useRef<Set<string>>(new Set());
  const loadedEdgeIds = useRef<Set<string>>(new Set());

  const loadInitialGraph = useCallback(async (mode: string, maxNodes: number = 50) => {
    setLoading(true);
    setError(null);
    loadedNodeIds.current.clear();
    loadedEdgeIds.current.clear();
    
    try {
      const response = await fetch(`/api/graph/progressive-network?mode=${mode}&maxNodes=${maxNodes}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load graph: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Track loaded nodes and edges
      data.nodes.forEach((node: GraphNode) => loadedNodeIds.current.add(node.id));
      data.edges.forEach((edge: GraphEdge) => loadedEdgeIds.current.add(edge.id));
      
      setGraphData(data);
      setHasMore(data.hasMore);
      setTotalAvailable(data.totalAvailable);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load graph';
      setError(errorMessage);
      console.error('Error loading initial graph:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const expandNode = useCallback(async (nodeId: string, maxNodes: number = 30) => {
    if (!graphData) return;
    
    setIsLoadingMore(true);
    setError(null);
    
    try {
      const currentNodes = Array.from(loadedNodeIds.current);
      const response = await fetch(
        `/api/graph/progressive-network?expandNodeId=${nodeId}&currentNodes=${currentNodes.join(',')}&maxNodes=${maxNodes}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to expand node: ${response.statusText}`);
      }
      
      const newData = await response.json();
      
      if (newData.nodes.length === 0) {
        setHasMore(false);
        return;
      }
      
      // Merge new data with existing data
      const existingNodes = graphData.nodes;
      const existingEdges = graphData.edges;
      
      // Filter out already loaded nodes and edges
      const newNodes = newData.nodes.filter((node: GraphNode) => !loadedNodeIds.current.has(node.id));
      const newEdges = newData.edges.filter((edge: GraphEdge) => !loadedEdgeIds.current.add(edge.id));
      
      // Track new nodes and edges
      newNodes.forEach((node: GraphNode) => loadedNodeIds.current.add(node.id));
      newEdges.forEach((edge: GraphEdge) => loadedEdgeIds.current.add(edge.id));
      
      const mergedData: GraphData = {
        nodes: [...existingNodes, ...newNodes],
        edges: [...existingEdges, ...newEdges],
        hasMore: newData.hasMore,
        totalAvailable: graphData.totalAvailable
      };
      
      setGraphData(mergedData);
      setHasMore(newData.hasMore);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to expand node';
      setError(errorMessage);
      console.error('Error expanding node:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [graphData]);

  const resetGraph = useCallback(() => {
    setGraphData(null);
    setError(null);
    setHasMore(false);
    setTotalAvailable(0);
    loadedNodeIds.current.clear();
    loadedEdgeIds.current.clear();
  }, []);

  return {
    graphData,
    loading,
    error,
    hasMore,
    totalAvailable,
    loadInitialGraph,
    expandNode,
    resetGraph,
    isLoadingMore
  };
}
