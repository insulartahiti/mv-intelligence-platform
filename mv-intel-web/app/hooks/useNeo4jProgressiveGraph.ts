'use client';

import { useState, useCallback } from 'react';

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
  color?: string;
  title?: string;
  linkedin_first_degree?: boolean;
  affinity_strength?: number;
  [key: string]: any;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight: number;
  strength_score?: number;
  [key: string]: any;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hasMore: boolean;
  totalAvailable: number;
}

interface UseNeo4jProgressiveGraphReturn {
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

export function useNeo4jProgressiveGraph(): UseNeo4jProgressiveGraphReturn {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalAvailable, setTotalAvailable] = useState(0);

  const processNode = (node: any): GraphNode => ({
    id: node.id.toString(),
    label: node.label || node.name,
    type: node.type || 'Entity',
    domain: node.properties?.domain,
    industry: node.properties?.industry,
    pipeline_stage: node.properties?.pipeline_stage,
    fund: node.properties?.fund,
    taxonomy: node.properties?.taxonomy,
    is_internal: node.properties?.is_internal || false,
    is_portfolio: node.properties?.is_portfolio || false,
    is_pipeline: node.properties?.is_pipeline || false,
    importance: node.properties?.importance || 0,
    size: Math.max(6, Math.min(20, 6 + Math.log(1 + (node.properties?.connection_count || 0)) * 3)),
    connection_count: node.properties?.connection_count || 0,
    color: getNodeColor(node),
    title: generateTooltip(node),
    linkedin_first_degree: node.properties?.linkedin_first_degree || false,
    affinity_strength: node.properties?.affinity_strength || 0,
    ...node.properties
  });

  const processEdge = (edge: any): GraphEdge => ({
    id: edge.id.toString(),
    source: edge.from || edge.source,
    target: edge.to || edge.target,
    kind: edge.label || edge.kind || 'RELATES',
    weight: edge.properties?.weight || edge.weight || 0.5,
    strength_score: edge.properties?.strength_score || edge.strength_score || 0.5,
    ...edge.properties
  });

  const getNodeColor = (node: any) => {
    const props = node.properties;
    if (props?.is_internal) return '#dc2626'; // Red for internal
    if (props?.is_portfolio) return '#059669'; // Green for portfolio
    if (props?.is_pipeline) return '#3b82f6'; // Blue for pipeline
    if (props?.type === 'person') return '#2563eb'; // Blue for person
    if (props?.pipeline_stage === 'Qualified') return '#f59e0b'; // Amber for qualified
    if (props?.pipeline_stage === 'Investigate') return '#3b82f6'; // Light blue for investigate
    return '#6b7280'; // Default gray
  };

  const generateTooltip = (node: any) => {
    const props = node.properties;
    let tooltip = `<strong>${props?.name || node.label}</strong><br/>Type: ${props?.type || 'Entity'}`;
    if (props?.industry) tooltip += `<br/>Industry: ${props.industry}`;
    if (props?.pipeline_stage) tooltip += `<br/>Stage: ${props.pipeline_stage}`;
    if (props?.importance) tooltip += `<br/>Importance: ${props.importance.toFixed(2)}`;
    if (props?.is_internal) tooltip += `<br/>🏢 Internal Owner`;
    if (props?.is_portfolio) tooltip += `<br/>💼 Portfolio Company`;
    if (props?.is_pipeline) tooltip += `<br/>📈 Pipeline Company`;
    return tooltip;
  };

  const loadInitialGraph = useCallback(async (mode: string, maxNodes: number = 1000) => {
    console.log('loadInitialGraph called:', { mode, maxNodes });
    setLoading(true);
    setError(null);
    
    try {
      let url = `/api/neo4j/graph-data?limit=${maxNodes}`;
      
      // Apply mode-specific filters
      switch (mode) {
        case 'high-importance':
          url += '&minImportance=0.7';
          break;
        case 'internal':
          url += '&includeInternal=true';
          break;
        case 'portfolio':
          url += '&nodeType=organization&isPortfolio=true';
          break;
        case 'pipeline':
          url += '&isPipeline=true';
          break;
        default:
          // overview mode - no additional filters
          break;
      }

      console.log('Fetching URL:', url);
      const response = await fetch(url);
      const result = await response.json();
      console.log('API response:', { success: result.success, nodeCount: result.data?.nodes?.length });

      if (result.success) {
        const processedNodes = result.data.nodes.map(processNode);
        const processedEdges = result.data.edges.map(processEdge);
        
        setGraphData({
          nodes: processedNodes,
          edges: processedEdges,
          hasMore: processedNodes.length < (result.meta?.totalNodes || 0),
          totalAvailable: result.meta?.totalNodes || processedNodes.length
        });
        setTotalAvailable(result.meta?.totalNodes || processedNodes.length);
        setHasMore(processedNodes.length < (result.meta?.totalNodes || 0));
      } else {
        setError(result.message || 'Failed to load graph data');
      }
    } catch (err: any) {
      console.error('Error loading initial graph:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const expandNode = useCallback(async (nodeId: string, maxNodes: number = 500) => {
    setIsLoadingMore(true);
    setError(null);
    
    try {
      const url = `/api/neo4j/progressive-load?nodeId=${nodeId}&limit=${maxNodes}`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.success) {
        const newNodes = result.data.nodes.map(processNode);
        const newEdges = result.data.edges.map(processEdge);
        
        setGraphData(prev => {
          if (!prev) return null;
          
          // Merge new nodes and edges, avoiding duplicates
          const existingNodeIds = new Set(prev.nodes.map(n => n.id));
          const existingEdgeIds = new Set(prev.edges.map(e => e.id));
          
          const mergedNodes = [
            ...prev.nodes,
            ...newNodes.filter((node: any) => !existingNodeIds.has(node.id))
          ];
          
          const mergedEdges = [
            ...prev.edges,
            ...newEdges.filter((edge: any) => !existingEdgeIds.has(edge.id))
          ];
          
          return {
            nodes: mergedNodes,
            edges: mergedEdges,
            hasMore: mergedNodes.length < totalAvailable,
            totalAvailable
          };
        });
      } else {
        setError(result.message || 'Failed to expand node');
      }
    } catch (err: any) {
      console.error('Error expanding node:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoadingMore(false);
    }
  }, [totalAvailable]);

  const resetGraph = useCallback(() => {
    setGraphData(null);
    setError(null);
    setHasMore(true);
    setTotalAvailable(0);
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
