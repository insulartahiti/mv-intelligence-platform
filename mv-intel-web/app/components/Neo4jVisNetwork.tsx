'use client';

import { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { Focus } from 'lucide-react';

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
  
  // Use refs for datasets to avoid recreating them or dependency cycles
  const nodesDataSetRef = useRef<DataSet<any> | null>(null);
  const edgesDataSetRef = useRef<DataSet<any> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);

  const highlightedNodeIdsRef = useRef(highlightedNodeIds);
  const hoveredNodeIdRef = useRef(hoveredNodeId);

  // Color Logic
  const getNodeColor = (node: any, highlights: string[], hoverId: string | null | undefined) => {
    const props = node.properties || node;
    const isHovered = hoverId === node.id;
    const isHighlighted = highlights && highlights.includes(node.id);
    
    if (isHovered) return { background: '#4ade80', border: '#22c55e' }; // Green-400
    if (isHighlighted) return { background: '#fbbf24', border: '#f59e0b' }; // Amber-400

    if (props.is_internal) return { background: '#ef4444', border: '#b91c1c' }; // Red-500
    if (props.type === 'person') return { background: '#3b82f6', border: '#1d4ed8' }; // Blue-500
    if (props.type === 'organization') return { background: '#8b5cf6', border: '#6d28d9' }; // Violet-500
    return { background: '#64748b', border: '#475569' }; // Slate-500
  };

  // Handle External Hover (Zoom & Glow) - Only visual updates, no network reset
  useEffect(() => {
      hoveredNodeIdRef.current = hoveredNodeId;
      const nodesDS = nodesDataSetRef.current;
      
      if (networkRef.current && hoveredNodeId) {
          networkRef.current.focus(hoveredNodeId, {
              scale: 1.5,
              animation: {
                  duration: 1000,
                  easingFunction: 'easeInOutQuad'
              }
          });
          
          if (nodesDS) {
             const updates = nodesDS.get().map((node: any) => ({
                 id: node.id,
                 color: getNodeColor(node.originalProps, highlightedNodeIdsRef.current || [], hoveredNodeId),
                 borderWidth: node.id === hoveredNodeId ? 4 : 2,
                 shadow: node.id === hoveredNodeId ? { enabled: true, color: '#4ade80', size: 20, x: 0, y: 0 } : { enabled: true, color: 'rgba(0,0,0,0.5)', size: 10, x: 5, y: 5 }
             }));
             nodesDS.update(updates);
          }
      } else if (networkRef.current && !hoveredNodeId && nodesDS) {
          const updates = nodesDS.get().map((node: any) => ({
             id: node.id,
             color: getNodeColor(node.originalProps, highlightedNodeIdsRef.current || [], null),
             borderWidth: 2,
             shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 10, x: 5, y: 5 }
          }));
          nodesDS.update(updates);
      }
  }, [hoveredNodeId]); // Removed visNodes dependency

  // Handle Highlights - Only visual updates
  useEffect(() => {
      highlightedNodeIdsRef.current = highlightedNodeIds;
      const nodesDS = nodesDataSetRef.current;
      if (nodesDS && highlightedNodeIds) {
          const updates = nodesDS.get().map((node: any) => ({
              id: node.id,
              color: getNodeColor(node.originalProps, highlightedNodeIds, hoveredNodeIdRef.current)
          }));
          nodesDS.update(updates);
      }
  }, [highlightedNodeIds]);

  // Main Data Effect - Update Datasets Instead of Destroying Network
  useEffect(() => {
    let mounted = true;

    async function updateGraph() {
      if (!mounted) return;
      // Don't set loading true here if we're just updating, usually feels jumpy
      setError(null); // Clear previous errors on new attempt
      
      try {
        let nodes = [];
        let edges = [];

        if (subgraphData) {
            nodes = subgraphData.nodes || [];
            edges = subgraphData.edges || [];
        } else {
            // If no subgraphData, try fetching default
            // Only fetch if network not initialized or we explicit want default
            const res = await fetch(`/api/neo4j/neovis-data?limit=${limit}`);
            if (!res.ok) throw new Error('Failed to fetch graph data');
            const responseJson = await res.json();
            const data = responseJson.data || responseJson; // Handle nested or flat
            nodes = data?.nodes || [];
            edges = data?.edges || [];
        }

        if (!mounted) return;
        if (!Array.isArray(nodes)) nodes = [];
        if (!Array.isArray(edges)) edges = [];

        setNodeCount(nodes.length);
        setEdgeCount(edges.length);

        // Prepare data
        const newNodes = nodes.map((node: any) => ({
            id: node.id,
            label: node.label || node.properties?.name || 'Unknown',
            title: node.properties?.name || node.label,
            color: getNodeColor(node, highlightedNodeIdsRef.current || [], hoveredNodeIdRef.current),
            value: node.value || (node.properties?.importance || 0.5) * 25,
            originalProps: node
        }));

        const newEdges = edges.map((edge: any) => ({
            id: edge.id,
            from: edge.from,
            to: edge.to,
            label: edge.label,
            arrows: 'to',
            color: { color: '#64748b', opacity: 0.6 }
        }));

        // Check if Network Exists
        if (networkRef.current && nodesDataSetRef.current && edgesDataSetRef.current) {
            // UPDATE Existing Network
            nodesDataSetRef.current.clear();
            nodesDataSetRef.current.add(newNodes);
            edgesDataSetRef.current.clear();
            edgesDataSetRef.current.add(newEdges);
            
            // Optionally fit after update?
            networkRef.current.fit({ animation: { duration: 1000 } });
        } else {
            // INITIALIZE Network
            const nodesDataSet = new DataSet(newNodes);
            const edgesDataSet = new DataSet(newEdges);
            nodesDataSetRef.current = nodesDataSet;
            edgesDataSetRef.current = edgesDataSet;

            if (containerRef.current) {
                const options = {
                    nodes: {
                        shape: 'dot',
                        font: {
                            color: '#cbd5e1',
                            strokeWidth: 0,
                            size: 16,
                            face: 'Inter, system-ui, sans-serif'
                        },
                        borderWidth: 2,
                        shadow: {
                            enabled: true,
                            color: 'rgba(0,0,0,0.5)',
                            size: 10,
                            x: 5,
                            y: 5
                        },
                        scaling: { min: 15, max: 40 }
                    },
                    edges: {
                        width: 2,
                        smooth: { type: 'continuous', roundness: 0.5 },
                        color: { color: '#94a3b8', opacity: 0.8, highlight: '#bfdbfe', hover: '#bfdbfe' },
                        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
                        selectionWidth: 3
                    },
                    physics: {
                        enabled: true,
                        stabilization: {
                            enabled: true,
                            iterations: 1000,
                            updateInterval: 50,
                            fit: true
                        },
                        barnesHut: {
                            gravitationalConstant: -50000,
                            centralGravity: 0.1,
                            springLength: 300,
                            springConstant: 0.01,
                            damping: 0.25,
                            avoidOverlap: 1.0
                        },
                        solver: 'barnesHut',
                        maxVelocity: 30,
                        minVelocity: 0.75,
                        timestep: 0.4,
                        adaptiveTimestep: true
                    },
                    interaction: {
                        hover: true,
                        tooltipDelay: 200,
                        zoomView: true,
                        dragView: true,
                        multiselect: true,
                        keyboard: { enabled: true, bindToWindow: false },
                        navigationButtons: true,
                        zoomSpeed: 0.5
                    }
                };

                const network = new Network(containerRef.current, { nodes: nodesDataSet, edges: edgesDataSet }, options as any);
                
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

    updateGraph();

    return () => {
      mounted = false;
      // Do NOT destroy network on unmount of effect, only on component unmount?
      // Actually, React Strict Mode mounts/unmounts rapidly.
      // Ideally we keep the network instance if container persists.
      // But simpler here: if subgraphData changes, we run updateGraph.
      // We only destroy if the component is truly unmounting.
    };
  }, [subgraphData, limit]); // Depend on data

  // Cleanup on component unmount
  useEffect(() => {
      return () => {
          if (networkRef.current) {
              networkRef.current.destroy();
              networkRef.current = null;
          }
      }
  }, []);

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

      <div ref={containerRef} className="w-full h-full outline-none" tabIndex={0} />
      
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
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500"></span>
                    <span className="text-xs text-slate-300">Cited / Highlighted</span>
                </div>
            </div>
        </div>
      </div>

       <button
        onClick={handleRecenter}
        className="absolute bottom-6 right-6 z-20 bg-slate-800/80 backdrop-blur border border-slate-700 text-slate-300 p-2 rounded-lg hover:bg-slate-700 hover:text-white transition-colors shadow-lg"
        title="Recenter Graph"
      >
        <Focus size={20} />
      </button>
    </div>
  );
}