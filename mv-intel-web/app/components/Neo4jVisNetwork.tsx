'use client';

import { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

interface Neo4jVisNetworkProps {
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  onNodeHover?: (nodeId: string, nodeData: any) => void;
  highlightedNodeIds?: string[];
  subgraphData?: any;
  hoveredNodeId?: string | null;
  className?: string;
  limit?: number;
  minImportance?: number;
}

export default function Neo4jVisNetwork({ 
  onNodeClick, 
  onNodeHover, 
  highlightedNodeIds,
  subgraphData,
  hoveredNodeId,
  className = '',
  limit = 100,
  minImportance = 0.5
}: Neo4jVisNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  
  const [visNodes, setVisNodes] = useState<DataSet<any> | null>(null);
  const [visEdges, setVisEdges] = useState<DataSet<any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);

  const highlightedNodeIdsRef = useRef(highlightedNodeIds);
  const hoveredNodeIdRef = useRef(hoveredNodeId);

  const getNodeColor = (node: any, highlights: string[], hoverId: string | null | undefined) => {
    const props = node.properties || node;
    const isHovered = hoverId === node.id;
    const isHighlighted = highlights && highlights.includes(node.id);
    
    // Use object format for vis-network
    if (isHovered) return { background: '#4ade80', border: '#22c55e' }; // Green-400
    if (isHighlighted) return { background: '#fbbf24', border: '#f59e0b' }; // Amber-400

    if (props.is_internal) return { background: '#ef4444', border: '#b91c1c' }; // Red-500
    if (props.type === 'person') return { background: '#3b82f6', border: '#1d4ed8' }; // Blue-500
    if (props.type === 'organization') return { background: '#8b5cf6', border: '#6d28d9' }; // Violet-500
    return { background: '#64748b', border: '#475569' }; // Slate-500
  };

  // Handle External Hover (Zoom & Glow)
  useEffect(() => {
      hoveredNodeIdRef.current = hoveredNodeId;
      
      if (networkRef.current && hoveredNodeId) {
          networkRef.current.focus(hoveredNodeId, {
              scale: 1.5,
              animation: {
                  duration: 1000,
                  easingFunction: 'easeInOutQuad'
              }
          });
          
          if (visNodes) {
             const updates = visNodes.get().map((node: any) => ({
                 id: node.id,
                 color: getNodeColor(node.originalProps, highlightedNodeIdsRef.current || [], hoveredNodeId),
                 borderWidth: node.id === hoveredNodeId ? 4 : 2,
                 shadow: node.id === hoveredNodeId ? { enabled: true, color: '#4ade80', size: 20, x: 0, y: 0 } : { enabled: true, color: 'rgba(0,0,0,0.5)', size: 10, x: 5, y: 5 }
             }));
             visNodes.update(updates);
          }
      } else if (networkRef.current && !hoveredNodeId && visNodes) {
          const updates = visNodes.get().map((node: any) => ({
             id: node.id,
             color: getNodeColor(node.originalProps, highlightedNodeIdsRef.current || [], null),
             borderWidth: 2,
             shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 10, x: 5, y: 5 }
          }));
          visNodes.update(updates);
      }
  }, [hoveredNodeId, visNodes]);

  // Handle Highlights
  useEffect(() => {
      highlightedNodeIdsRef.current = highlightedNodeIds;
      if (visNodes && highlightedNodeIds) {
          const updates = visNodes.get().map((node: any) => ({
              id: node.id,
              color: getNodeColor(node.originalProps, highlightedNodeIds, hoveredNodeIdRef.current)
          }));
          visNodes.update(updates);
      }
  }, [highlightedNodeIds, visNodes]);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      if (!mounted) return;
      setLoading(true);
      try {
        let nodes = [];
        let edges = [];

        if (subgraphData) {
            nodes = subgraphData.nodes || [];
            edges = subgraphData.edges || [];
        } else {
            const res = await fetch(`/api/neo4j/neovis-data?limit=${limit}`);
            if (!res.ok) throw new Error('Failed to fetch graph data');
            const data = await res.json();
            nodes = data?.nodes || [];
            edges = data?.edges || [];
        }

        if (!mounted) return;

        // Defensive check
        if (!Array.isArray(nodes)) nodes = [];
        if (!Array.isArray(edges)) edges = [];

        setNodeCount(nodes.length);
        setEdgeCount(edges.length);

        const nodesDataSet = new DataSet(
          nodes.map((node: any) => ({
            id: node.id,
            label: node.label || node.properties?.name || 'Unknown',
            title: node.properties?.name || node.label,
            color: getNodeColor(node, highlightedNodeIdsRef.current || [], hoveredNodeIdRef.current),
            value: node.value || (node.properties?.importance || 0.5) * 10,
            originalProps: node // Store original props for re-coloring
          }))
        );

        const edgesDataSet = new DataSet(
          edges.map((edge: any) => ({
            id: edge.id,
            from: edge.from,
            to: edge.to,
            label: edge.label,
            arrows: 'to',
            color: { color: '#475569', opacity: 0.4 }
          }))
        );

        setVisNodes(nodesDataSet);
        setVisEdges(edgesDataSet);
        
        if (containerRef.current) {
            const options = {
                nodes: {
                    shape: 'dot',
                    font: {
                        color: '#cbd5e1', // Slate-300
                        strokeWidth: 0,
                        size: 14
                    },
                    borderWidth: 2,
                    shadow: {
                        enabled: true,
                        color: 'rgba(0,0,0,0.5)',
                        size: 10,
                        x: 5,
                        y: 5
                    }
                },
                edges: {
                    width: 1,
                    smooth: {
                        type: 'continuous'
                    },
                    color: {
                        color: '#475569',
                        highlight: '#94a3b8',
                        hover: '#94a3b8'
                    }
                },
                physics: {
                    enabled: true,
                    stabilization: {
                        iterations: 500,
                        fit: false // Don't fit after stabilization to avoid jumping
                    },
                    barnesHut: {
                        gravitationalConstant: -3000,
                        centralGravity: 0.3,
                        springLength: 100,
                        springConstant: 0.04,
                        damping: 0.09,
                        avoidOverlap: 0.5
                    }
                },
                interaction: {
                    hover: true,
                    tooltipDelay: 200,
                    zoomView: true,
                    dragView: true,
                    multiselect: true,
                    keyboard: {
                        enabled: true
                    },
                    navigationButtons: true,
                    zoomSpeed: 0.5
                }
            };

            const network = new Network(containerRef.current, { nodes: nodesDataSet as any, edges: edgesDataSet as any }, options as any);
            
            network.on("click", function (params) {
                if (params.nodes.length > 0) {
                    const nodeId = params.nodes[0];
                    const node = nodesDataSet.get(nodeId);
                    if (onNodeClick) onNodeClick(nodeId, node);
                }
            });

            network.on("hoverNode", function (params) {
                if (onNodeHover) {
                    const node = nodesDataSet.get(params.node);
                    onNodeHover(params.node, node);
                }
            });

            networkRef.current = network;
        }

        setLoading(false);
      } catch (err: any) {
        console.error("Graph error:", err);
        if (mounted) {
            setError(err.message);
            setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      mounted = false;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [subgraphData, limit]);

  const handleRecenter = () => {
      if (networkRef.current) {
          networkRef.current.fit({ animation: { duration: 1000, easingFunction: 'easeInOutQuad' } });
      }
  };

  return (
    <div className={`relative ${className} w-full h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-slate-400 text-sm">Loading Graph...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
          <div className="text-red-400 bg-red-900/20 p-4 rounded-lg border border-red-900/50">
            <p className="font-medium">Error loading graph</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
      
      {/* Legend / Stats Overlay */}
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur p-3 rounded-lg border border-slate-800 shadow-xl">
            <div className="text-xs font-mono text-slate-500 mb-2">
                {nodeCount} Nodes • {edgeCount} Edges
            </div>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600"></span>
                    <span className="text-xs text-slate-300">People</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-violet-500 border border-violet-600"></span>
                    <span className="text-xs text-slate-300">Organizations</span>
                </div>
                 <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 border border-red-600"></span>
                    <span className="text-xs text-slate-300">Internal</span>
                </div>
            </div>
        </div>
      </div>

       <button
        onClick={handleRecenter}
        className="absolute bottom-6 right-6 z-20 bg-slate-800/80 backdrop-blur border border-slate-700 text-slate-300 p-2 rounded-lg hover:bg-slate-700 hover:text-white transition-colors shadow-lg"
        title="Recenter Graph"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
      </button>
    </div>
  );
}