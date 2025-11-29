'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

interface ProgressiveNeo4jVisNetworkProps {
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  onNodeHover?: (nodeId: string, nodeData: any) => void;
  className?: string;
  initialLimit?: number;
  minImportance?: number;
}

export default function ProgressiveNeo4jVisNetwork({ 
  onNodeClick, 
  onNodeHover, 
  className = '',
  initialLimit = 200,
  minImportance = 0.1
}: ProgressiveNeo4jVisNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [allNodes, setAllNodes] = useState<Map<string, any>>(new Map());
  const [allEdges, setAllEdges] = useState<Map<string, any>>(new Map());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  // Use refs to store the latest callback functions
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeHoverRef = useRef(onNodeHover);

  // Update refs when props change
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onNodeHoverRef.current = onNodeHover;
  }, [onNodeClick, onNodeHover]);

  const loadData = useCallback(async (cursor: number, expandNodeId?: string) => {
    try {
      const url = new URL('/api/neo4j/neovis-data', window.location.origin);
      url.searchParams.set('limit', initialLimit.toString());
      url.searchParams.set('minImportance', minImportance.toString());
      url.searchParams.set('cursor', cursor.toString());
      if (expandNodeId) {
        url.searchParams.set('expandNodeId', expandNodeId);
      }

      console.log('ProgressiveNeo4jVisNetwork: Loading data from:', url.toString());
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('ProgressiveNeo4jVisNetwork: API response:', { 
        success: result.success, 
        nodeCount: result.data?.nodes?.length,
        hasMore: result.data?.meta?.hasMore 
      });

      if (result.success && result.data) {
        const { nodes, edges, meta } = result.data;
        
        // Update stats
        setStats(meta);
        setHasMore(meta.hasMore || false);
        setCursor(meta.nextCursor || cursor);

        // Merge new data with existing data
        const newNodes = new Map(allNodes);
        const newEdges = new Map(allEdges);

        nodes.forEach((node: any) => {
          newNodes.set(node.id, node);
        });

        edges.forEach((edge: any) => {
          newEdges.set(edge.id, edge);
        });

        setAllNodes(newNodes);
        setAllEdges(newEdges);

        // Update the network if it exists
        if (networkRef.current) {
          const visNodes = new DataSet(Array.from(newNodes.values()).map(node => ({
            id: node.id,
            label: node.label,
            group: node.group,
            color: getNodeColor(node),
            size: getNodeSize(node.properties.importance || 0.5),
            font: {
              size: 14,
              color: '#000000',
              strokeWidth: 2,
              strokeColor: '#ffffff'
            },
            title: getNodeTooltip(node),
            properties: node.properties
          })));

          const visEdges = new DataSet(Array.from(newEdges.values()).map(edge => ({
            id: edge.id,
            from: edge.from,
            to: edge.to,
            label: edge.label,
            color: getEdgeColor(edge),
            width: getEdgeWidth(edge.properties.weight || 0.5),
            title: getEdgeTooltip(edge),
            properties: edge.properties
          })));

          const data = { nodes: visNodes, edges: visEdges };
          networkRef.current.setData(data);
        }

        return { success: true, hasMore: meta.hasMore };
      } else {
        throw new Error(result.message || 'Failed to load data');
      }
    } catch (err: any) {
      console.error('ProgressiveNeo4jVisNetwork: Error loading data:', err);
      throw err;
    }
  }, [allNodes, allEdges, initialLimit, minImportance]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      await loadData(cursor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, cursor, loadData]);

  const expandNode = useCallback(async (nodeId: string) => {
    if (expandedNodes.has(nodeId)) return;
    
    setLoadingMore(true);
    try {
      await loadData(0, nodeId);
      setExpandedNodes(prev => new Set([...prev, nodeId]));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [expandedNodes, loadData]);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        await loadData(0);
        setLoading(false);
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [loadData]);

  // Create network when data is available
  useEffect(() => {
    if (loading || allNodes.size === 0 || !containerRef.current) return;

    try {
      const visNodes = new DataSet(Array.from(allNodes.values()).map(node => ({
        id: node.id,
        label: node.label,
        group: node.group,
        color: getNodeColor(node),
        size: getNodeSize(node.properties.importance || 0.5),
        font: {
          size: 14,
          color: '#000000',
          strokeWidth: 2,
          strokeColor: '#ffffff'
        },
        title: getNodeTooltip(node),
        properties: node.properties
      })));

      const visEdges = new DataSet(Array.from(allEdges.values()).map(edge => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        color: getEdgeColor(edge),
        width: getEdgeWidth(edge.properties.weight || 0.5),
        title: getEdgeTooltip(edge),
        properties: edge.properties
      })));

      const data = { nodes: visNodes, edges: visEdges };
      
      const options = {
        nodes: {
          shape: 'dot',
          font: {
            size: 14,
            color: '#000000',
            strokeWidth: 2,
            strokeColor: '#ffffff'
          },
          borderWidth: 2,
          shadow: true
        },
        edges: {
          width: 2,
          color: { color: '#848484', highlight: '#ff0000' },
          smooth: {
            enabled: true,
            type: 'continuous',
            forceDirection: 'none',
            roundness: 0.4
          },
          arrows: {
            to: { enabled: true, scaleFactor: 0.5 }
          },
          font: {
            size: 10,
            color: '#343434',
            background: 'rgba(255,255,255,0.7)'
          }
        },
        physics: {
          enabled: true,
          stabilization: { enabled: true, iterations: 50 },
          barnesHut: {
            gravitationalConstant: -12000,
            centralGravity: 0.1,
            springLength: 200,
            springConstant: 0.05,
            damping: 0.4,
            avoidOverlap: 1.0
          }
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          hideEdgesOnDrag: false
        },
        layout: {
          improvedLayout: false
        }
      };

      if (containerRef.current) {
        networkRef.current = new Network(containerRef.current, data, options);

        // Add event listeners
        networkRef.current.on('click', (params) => {
          if (params.nodes.length > 0 && onNodeClickRef.current) {
            const nodeId = params.nodes[0];
            const nodeData = allNodes.get(nodeId);
            onNodeClickRef.current(nodeId, nodeData);
            
            // Expand node on click
            expandNode(nodeId);
          }
        });

        networkRef.current.on('hoverNode', (params) => {
          if (onNodeHoverRef.current) {
            const nodeId = params.node;
            const nodeData = allNodes.get(nodeId);
            onNodeHoverRef.current(nodeId, nodeData);
          }
        });

        // Re-enable physics on interaction
        networkRef.current.on('zoom', () => {
          if (networkRef.current) {
            networkRef.current.setOptions({
              physics: { enabled: true, stabilization: { enabled: false } }
            });
          }
        });

        networkRef.current.on('dragStart', () => {
          if (networkRef.current) {
            networkRef.current.setOptions({
              physics: { enabled: true, stabilization: { enabled: false } }
            });
          }
        });

        networkRef.current.on('dragEnd', () => {
          if (networkRef.current) {
            setTimeout(() => {
              if (networkRef.current) {
                networkRef.current.setOptions({
                  physics: { enabled: true, stabilization: { enabled: true, iterations: 50 } }
                });
              }
            }, 1000);
          }
        });
      }
    } catch (err: any) {
      console.error('ProgressiveNeo4jVisNetwork: Error creating network:', err);
      setError(err.message);
    }

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [loading, allNodes, allEdges, expandNode]);

  const getNodeColor = (node: any) => {
    const props = node.properties;
    if (props.is_internal) return '#dc2626'; // Red for internal
    if (props.is_portfolio) return '#059669'; // Green for portfolio
    if (props.is_pipeline) return '#f59e0b'; // Yellow for pipeline
    if (props.linkedin_first_degree) return '#7c3aed'; // Purple for LinkedIn 1st degree
    return '#3b82f6'; // Blue for others
  };

  const getNodeSize = (importance: number) => {
    return Math.max(15, Math.min(50, 15 + importance * 25));
  };

  const getEdgeColor = (edge: any) => {
    const kind = edge.properties.kind;
    switch (kind) {
      case 'founder': return '#ef4444';
      case 'works_at': return '#3b82f6';
      case 'owner': return '#059669';
      case 'deal_team': return '#f59e0b';
      default: return '#848484';
    }
  };

  const getEdgeWidth = (weight: number) => {
    return Math.max(1, Math.min(5, weight * 5));
  };

  const getNodeTooltip = (node: any) => {
    const props = node.properties;
    let tooltip = `<strong>${node.label}</strong><br/>`;
    tooltip += `Type: ${props.type || 'Unknown'}<br/>`;
    tooltip += `Importance: ${(props.importance || 0).toFixed(2)}<br/>`;
    
    if (props.is_internal) tooltip += 'Internal Owner<br/>';
    if (props.is_portfolio) tooltip += 'Portfolio Company<br/>';
    if (props.is_pipeline) tooltip += `Pipeline: ${props.pipeline_stage || 'Unknown'}<br/>`;
    if (props.linkedin_first_degree) tooltip += 'LinkedIn 1st Degree<br/>';
    if (props.industry) tooltip += `Industry: ${props.industry}<br/>`;
    if (props.domain) tooltip += `Domain: ${props.domain}<br/>`;
    
    // Parse enrichment data if available
    if (props.enrichment_data) {
      try {
        const enrichment = typeof props.enrichment_data === 'string' 
          ? JSON.parse(props.enrichment_data) 
          : props.enrichment_data;
        
        if (enrichment.web_search_data) {
          const webData = typeof enrichment.web_search_data === 'string'
            ? JSON.parse(enrichment.web_search_data)
            : enrichment.web_search_data;
          
          if (webData.results && webData.results.length > 0) {
            tooltip += `<br/><strong>Recent Updates:</strong><br/>`;
            webData.results.slice(0, 2).forEach((result: any, index: number) => {
              tooltip += `${index + 1}. ${result.title}<br/>`;
              if (result.snippet) {
                tooltip += `   ${result.snippet.substring(0, 100)}...<br/>`;
              }
            });
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    return tooltip;
  };

  const getEdgeTooltip = (edge: any) => {
    const props = edge.properties;
    return `${props.kind || edge.label}<br/>Strength: ${(props.strength_score || 0).toFixed(2)}`;
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full min-h-[600px] bg-gray-50 rounded-lg"
        style={{ minHeight: '600px' }}
      />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading initial graph...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50">
          <div className="text-center p-4">
            <p className="text-red-600 font-medium">Error: {error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Load More Button */}
      {hasMore && !loading && (
        <div className="absolute top-4 right-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {loadingMore ? 'Loading...' : `Load More (${stats?.totalAvailable || 0} total)`}
          </button>
        </div>
      )}

      {/* Stats Panel */}
      {stats && (
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 text-xs">
          <div className="font-semibold mb-1">Graph Stats</div>
          <div>Nodes: {allNodes.size}</div>
          <div>Edges: {allEdges.size}</div>
          <div>Expanded: {expandedNodes.size}</div>
          {hasMore && <div className="text-blue-600">More available</div>}
        </div>
      )}
    </div>
  );
}
