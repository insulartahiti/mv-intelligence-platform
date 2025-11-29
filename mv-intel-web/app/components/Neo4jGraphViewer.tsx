'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { useNeo4jFullDataset } from '../hooks/useNeo4jFullDataset';

interface Neo4jGraphViewerProps {
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  onNodeHover?: (nodeId: string, nodeData: any) => void;
  className?: string;
  initialLimit?: number;
  minImportance?: number;
}

interface GraphData {
  nodes: any[];
  edges: any[];
  meta: {
    totalNodes: number;
    totalEdges: number;
    hasMore: boolean;
  };
}

const Neo4jGraphViewer = React.memo(function Neo4jGraphViewer({ 
  onNodeClick, 
  onNodeHover, 
  className = '',
  initialLimit = 1000,
  minImportance = 0.05
}: Neo4jGraphViewerProps) {
  // console.log('Neo4jGraphViewer: Component rendered');
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [networkReady, setNetworkReady] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const isCreatingNetwork = useRef(false);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized callback refs to prevent unnecessary re-renders
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeHoverRef = useRef(onNodeHover);
  
  // Use local full dataset for offline capability
  const { fullDataset, loading: fullDatasetLoading } = useNeo4jFullDataset();

  // Update refs when props change
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onNodeHoverRef.current = onNodeHover;
  }, [onNodeClick, onNodeHover]);

  // Handle user interactions with aggressive physics stabilization
  const handleUserInteraction = useCallback(() => {
    if (!networkRef.current) return;

    // Clear existing timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }

    // Set interacting state
    setIsInteracting(true);

    // Apply aggressive stabilization during interaction
    networkRef.current.setOptions({
      physics: {
        enabled: true,
        stabilization: { 
          enabled: true, 
          iterations: 200,              // Quick stabilization during interaction
          updateInterval: 10,           // Very frequent updates
          fit: false                    // Don't fit during interaction
        },
        barnesHut: {
          gravitationalConstant: -30000, // Balanced repulsion
          centralGravity: 0.01,
          springLength: 300,             // Tighter connections
          springConstant: 0.08,          // Softer springs
          damping: 0.4,                  // More fluid movement
          avoidOverlap: 0.2              // Allow some overlap for smoother interaction
        },
        solver: 'barnesHut',
        maxVelocity: 40,                 
        minVelocity: 1,              
        timestep: 0.35                    
      }
    });

    // Reset to normal physics after interaction ends
    interactionTimeoutRef.current = setTimeout(() => {
      if (networkRef.current) {
        networkRef.current.setOptions({
          physics: {
            enabled: true,
            stabilization: { 
              enabled: true, 
              iterations: 1000,
              updateInterval: 25,
              fit: true
            },
            barnesHut: {
              gravitationalConstant: -50000,
              centralGravity: 0.01,
              springLength: 600,
              springConstant: 0.15,
              damping: 0.9,
              avoidOverlap: 0.95
            },
            solver: 'barnesHut',
            maxVelocity: 50,
            minVelocity: 0.05,
            timestep: 0.25
          }
        });
        setIsInteracting(false);
        console.log('Neo4jGraphViewer: Interaction ended, physics reset to normal');
      }
    }, 1000); // 1 second delay after last interaction
  }, []);

  // Node styling functions
  const getNodeColor = useCallback((node: any) => {
    const props = node.properties || {};
    if (props.is_internal) return '#ef4444'; // Red-500 for internal
    if (props.is_portfolio) return '#10b981'; // Emerald-500 for portfolio
    if (props.is_pipeline) {
      switch (props.pipeline_stage) {
        case 'Qualified': return '#f59e0b'; // Amber-500 for qualified
        case 'Investigate': return '#3b82f6'; // Blue-500 for investigate
        default: return '#3b82f6'; // Default blue for pipeline
      }
    }
    if (props.linkedin_first_degree) return '#8b5cf6'; // Violet-500 for LinkedIn 1st degree
    
    // Distinguish Organization vs Person
    if (props.type === 'organization') return '#94a3b8'; // Slate-400 for Organizations
    return '#3b82f6'; // Blue-500 for Person
  }, []);

  const getNodeSize = useCallback((node: any) => {
    const importance = node.properties?.importance || 0;
    const degree = node.properties?.degree || 0;
    return Math.max(15, Math.min(50, 15 + importance * 25 + degree * 0.5));
  }, []);

  const getNodeTooltip = useCallback((node: any) => {
    const props = node.properties || {};
    let tooltip = `<strong>${node.label || node.id}</strong><br/>`;
    tooltip += `Type: ${props.type || 'Entity'}<br/>`;
    if (props.importance) tooltip += `Importance: ${props.importance.toFixed(2)}<br/>`;
    if (props.degree !== undefined) tooltip += `Connections: ${props.degree}<br/>`;
    if (props.is_internal) tooltip += 'Internal Owner<br/>';
    if (props.is_portfolio) tooltip += 'Portfolio Company<br/>';
    if (props.is_pipeline) tooltip += `Pipeline: ${props.pipeline_stage || 'Unknown'}<br/>`;
    if (props.linkedin_first_degree) tooltip += 'LinkedIn 1st Degree<br/>';
    if (props.industry) tooltip += `Industry: ${props.industry}<br/>`;
    if (props.domain) tooltip += `Domain: ${props.domain}<br/>`;
    return tooltip;
  }, []);

  // Load enhanced data for a specific node and expand the graph
  const loadEnhancedNodeData = useCallback(async (nodeId: string) => {
    try {
      console.log('Neo4jGraphViewer: Loading enhanced data for node:', nodeId);
      
      // Fetch expanded graph data around this node
      const response = await fetch(`/api/neo4j/graph-data-optimized?limit=2000&minImportance=0.01&cursor=0&expandNodeId=${nodeId}&includeMetrics=true`);
      const result = await response.json();
      
      if (result.success && result.data) {
        const newData = result.data;
        console.log('Neo4jGraphViewer: Enhanced data loaded:', {
          nodes: newData.nodes.length,
          edges: newData.edges.length,
          expandedNode: nodeId
        });
        
        // Update the graph with expanded data
        if (networkRef.current && newData.nodes.length > 0) {
          // Convert to vis-network format
          const visNodes = new DataSet(
            newData.nodes.map((node: any) => ({
              id: node.id,
              label: node.label,
              group: node.group,
              color: getNodeColor(node),
              size: getNodeSize(node),
              font: {
                size: 14,
                color: '#e2e8f0', // slate-200
                strokeWidth: 3,
                strokeColor: '#0f172a' // slate-900 (background color) for contrast
              },
              title: getNodeTooltip(node),
              properties: node.properties
            }))
          );

          const visEdges = new DataSet(
            newData.edges.map((edge: any) => ({
              id: edge.id,
              from: edge.from,
              to: edge.to,
              label: edge.label,
              color: { color: '#475569', opacity: 0.6 }, // slate-600
              width: Math.max(1, (edge.properties?.strength_score || 0.5) * 4),
              title: `${edge.label}<br/>Strength: ${(edge.properties?.strength_score || 0).toFixed(2)}`,
              properties: edge.properties
            }))
          );

          // Update the network data
          networkRef.current.setData({ nodes: visNodes as any, edges: visEdges as any });
          
          // Update our local state
          setGraphData({
            nodes: newData.nodes,
            edges: newData.edges,
            meta: newData.meta
          });
          
          // Restart physics to accommodate new nodes
          setTimeout(() => {
            if (networkRef.current) {
              networkRef.current.setOptions({
                physics: {
                  enabled: true,
                  stabilization: { 
                    enabled: true, 
                    iterations: 1000,
                    updateInterval: 25,
                    fit: true
                  },
                  barnesHut: {
                    gravitationalConstant: -50000,
                    centralGravity: 0.01,
                    springLength: 600,
                    springConstant: 0.15,
                    damping: 0.9,
                    avoidOverlap: 0.95
                  },
                  solver: 'barnesHut',
                  maxVelocity: 50,
                  minVelocity: 0.05,
                  timestep: 0.25
                }
              });
              console.log('Neo4jGraphViewer: Graph expanded with enhanced data');
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Neo4jGraphViewer: Error loading enhanced node data:', error);
    }
  }, [getNodeColor, getNodeSize, getNodeTooltip]);

  // Fetch graph data from Neo4j (or local cache)
  const fetchGraphData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Try Local Full Dataset first (Instant Load)
      if (fullDataset) {
        console.log('Neo4jGraphViewer: 📦 Using local Full Dataset from IndexedDB');
        
        // Filter nodes based on importance and limit
        const filteredNodes = fullDataset.nodes
            .filter((n: any) => (n.importance || 0) >= minImportance)
            .sort((a: any, b: any) => (b.importance || 0) - (a.importance || 0))
            .slice(0, initialLimit);
        
        // Filter edges that connect these nodes
        const nodeIds = new Set(filteredNodes.map((n: any) => n.id));
        const filteredEdges = fullDataset.edges.filter((e: any) => 
            nodeIds.has(e.source) && nodeIds.has(e.target)
        );

        console.log(`Neo4jGraphViewer: Filtered local data: ${filteredNodes.length} nodes, ${filteredEdges.length} edges`);

        setGraphData({
            nodes: filteredNodes,
            edges: filteredEdges,
            meta: {
                totalNodes: filteredNodes.length,
                totalEdges: filteredEdges.length,
                hasMore: fullDataset.nodes.length > initialLimit
            }
        });
        setLoading(false);
        return;
      }

      // 2. Fallback to Network Fetch if local data not ready
      console.log('Neo4jGraphViewer: Local data not ready, fetching from API...');
      const response = await fetch(
        `/api/neo4j/graph-data-optimized?limit=${initialLimit}&minImportance=${minImportance}&cursor=0&includeMetrics=true`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Neo4jGraphViewer: API response:', result);

      if (result.success && result.data) {
        console.log('Neo4jGraphViewer: Data loaded successfully', {
          nodeCount: result.data.nodes?.length || 0,
          edgeCount: result.data.edges?.length || 0,
          meta: result.data.meta
        });
        setGraphData(result.data);
      } else {
        throw new Error(result.message || 'Failed to load graph data');
      }
    } catch (err: any) {
      console.error('Error fetching graph data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [initialLimit, minImportance, fullDataset]);

  // Component mount/unmount tracking
  useEffect(() => {
    console.log('Neo4jGraphViewer: Component mounted');
    return () => {
      console.log('Neo4jGraphViewer: Component unmounting');
    };
  }, []);

  // Load data on mount
  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  // Monitor container resize
  useEffect(() => {
    if (!containerRef.current || !networkRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current && networkRef.current) {
          console.log('Neo4jGraphViewer: Container resized', {
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
          // Redraw the network to fit the new size
          setTimeout(() => {
            if (networkRef.current) {
              networkRef.current.redraw();
              networkRef.current.fit();
            }
          }, 100);
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [networkReady]);

  // Periodic network health check
  useEffect(() => {
    if (!networkReady || !networkRef.current) return;

    const checkInterval = setInterval(() => {
      if (networkRef.current) {
        // Simple existence check is enough
        console.log('Neo4jGraphViewer: Network health check - OK', {
          networkExists: !!networkRef.current,
          graphDataNodes: graphData?.nodes?.length || 0,
          graphDataEdges: graphData?.edges?.length || 0
        });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(checkInterval);
  }, [networkReady, graphData]);

  // Network options - optimized for performance and usability
  const networkOptions = useMemo(() => ({
    nodes: {
      shape: 'dot',
      font: {
        size: 14,
        color: '#e2e8f0', // slate-200
        strokeWidth: 3,
        strokeColor: '#0f172a' // slate-900 (background)
      },
      borderWidth: 2,
      shadow: true
    },
    edges: {
      width: 2,
      color: { color: '#475569', highlight: '#94a3b8' }, // slate-600, highlight slate-400
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
        color: '#e2e8f0', // slate-200
        background: 'rgba(15, 23, 42, 0.8)' // slate-900 with opacity
      }
    },
    physics: {
      enabled: true,
      stabilization: { 
        enabled: true, 
        iterations: 1000,              // More iterations for better layout
        updateInterval: 25,            // More frequent updates
        fit: true
      },
      barnesHut: {
        gravitationalConstant: -50000, // Much stronger repulsion for 2000+ nodes
        centralGravity: 0.01,          // Minimal central pull to prevent clustering
        springLength: 600,             // Much longer springs for more spacing
        springConstant: 0.15,          // Stronger spring force
        damping: 0.9,                  // Very high damping for stability
        avoidOverlap: 0.95             // Maximum overlap avoidance
      },
      solver: 'barnesHut',
      maxVelocity: 50,                 // Higher max velocity
      minVelocity: 0.05,               // Lower min velocity for better settling
      timestep: 0.25                   // Slower timestep for stability
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      hideEdgesOnDrag: false,
      selectConnectedEdges: true,
      dragView: true,
      zoomView: true,
      keyboard: {
        enabled: false
      }
    },
    layout: {
      improvedLayout: false
    }
  }), []);

  // Create network when data is available
  useEffect(() => {
    if (!graphData || !containerRef.current) {
      return;
    }

    // Don't recreate if network already exists and is ready
    if (networkRef.current && networkReady) {
      return;
    }

    // Prevent multiple simultaneous network creations
    if (isCreatingNetwork.current) {
      return;
    }

    // Clean up existing network if it exists
    if (networkRef.current) {
      console.log('Neo4jGraphViewer: Destroying existing network');
      networkRef.current.destroy();
      networkRef.current = null;
      setNetworkReady(false);
    }

    isCreatingNetwork.current = true;

    try {
      // Convert data to vis-network format
      const visNodes = new DataSet(
        graphData.nodes.map(node => ({
          id: node.id,
          label: node.label,
          group: node.group,
          color: getNodeColor(node),
          size: getNodeSize(node),
          font: {
            size: 14,
            color: '#e2e8f0', // slate-200
            strokeWidth: 3,
            strokeColor: '#0f172a' // slate-900 (background)
          },
          title: getNodeTooltip(node),
          properties: node.properties
        }))
      );

      const visEdges = new DataSet(
        graphData.edges.map(edge => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          label: edge.label,
          color: { color: '#475569', opacity: 0.6 }, // slate-600
          width: Math.max(1, (edge.properties?.strength_score || 0.5) * 4),
          title: `${edge.label}<br/>Strength: ${(edge.properties?.strength_score || 0).toFixed(2)}`,
          properties: edge.properties
        }))
      );

      const data = { nodes: visNodes, edges: visEdges };

      // Create network
      console.log('Neo4jGraphViewer: Creating new network with', data.nodes.length, 'nodes and', data.edges.length, 'edges');
      console.log('Neo4jGraphViewer: Container dimensions:', {
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight,
        clientWidth: containerRef.current.clientWidth,
        clientHeight: containerRef.current.clientHeight
      });
      
      // Ensure container has dimensions
      if (containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) {
        console.warn('Neo4jGraphViewer: Container has no dimensions, waiting for layout...');
        // Wait a bit for layout to complete
        setTimeout(() => {
          if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
            console.log('Neo4jGraphViewer: Retrying network creation after layout');
            networkRef.current = new Network(containerRef.current, data, networkOptions);
            setNetworkReady(true);
          }
        }, 100);
        return;
      }
      
      networkRef.current = new Network(containerRef.current, data, networkOptions);

      // Ensure the network fits the container and restart physics
      setTimeout(() => {
        if (networkRef.current) {
          networkRef.current.fit();
          // Restart physics to apply new settings
          networkRef.current.setOptions({
            physics: {
              enabled: true,
              stabilization: { 
                enabled: true, 
                iterations: 1000,
                updateInterval: 25,
                fit: true
              },
              barnesHut: {
                gravitationalConstant: -20000,
                centralGravity: 0.05,
                springLength: 400,
                springConstant: 0.1,
                damping: 0.8,
                avoidOverlap: 0.9
              },
              solver: 'barnesHut',
              maxVelocity: 50,
              minVelocity: 0.05,
              timestep: 0.25
            }
          });
          console.log('Neo4jGraphViewer: Network fitted and physics restarted');
        }
      }, 100);

      // Add event listeners
      networkRef.current.on('click', async (params) => {
        console.log('Neo4jGraphViewer: Click event received:', params);
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const nodeData = visNodes.get(nodeId);
          console.log('Neo4jGraphViewer: Node clicked:', nodeId, nodeData);
          setSelectedNode(nodeId);
          
          // Load enhanced data for the selected node
          await loadEnhancedNodeData(nodeId);
          
          // Call the parent's node click handler
          console.log('Neo4jGraphViewer: Calling parent onNodeClick callback');
          console.log('Neo4jGraphViewer: onNodeClickRef.current:', onNodeClickRef.current);
          if (onNodeClickRef.current) {
            console.log('Neo4jGraphViewer: Calling callback with nodeId:', nodeId, 'nodeData:', nodeData);
            onNodeClickRef.current(nodeId, nodeData);
          } else {
            console.log('Neo4jGraphViewer: onNodeClickRef.current is null/undefined');
          }
        } else {
          console.log('Neo4jGraphViewer: Click event but no nodes selected');
        }
      });

      networkRef.current.on('hoverNode', (params) => {
        const nodeData = visNodes.get(params.node);
        onNodeHoverRef.current?.(params.node, nodeData);
      });

      // Listen for physics stabilization
      networkRef.current.on('stabilizationIterationsDone', () => {
        console.log('Neo4jGraphViewer: Physics stabilization complete');
      });

      networkRef.current.on('stabilizationProgress', (params) => {
        console.log('Neo4jGraphViewer: Physics progress:', params.iterations, '/', params.total);
      });

      // Enhanced interaction tracking for aggressive physics stabilization
      networkRef.current.on('zoom', () => {
        handleUserInteraction();
      });

      networkRef.current.on('dragStart', () => {
        handleUserInteraction();
      });

      networkRef.current.on('dragEnd', () => {
        handleUserInteraction();
      });

      networkRef.current.on('selectNode', () => {
        handleUserInteraction();
      });

      console.log('Neo4jGraphViewer: Network created successfully');
      setNetworkReady(true);
    } catch (err: any) {
      console.error('Error creating network:', err);
      setError(err.message);
      setNetworkReady(false);
    } finally {
      isCreatingNetwork.current = false;
    }
  }, [graphData, networkOptions]);

  // Handle selected node styling
  useEffect(() => {
    if (!networkRef.current || !selectedNode || !graphData) return;

    try {
      console.log('Neo4jGraphViewer: Updating selected node styling for:', selectedNode);
      // Update the node styling using the DataSet methods
      const updatedNodes = graphData.nodes.map(node => ({
        ...node,
        chosen: node.id === selectedNode
      }));
      
      // Update the nodes dataset
      if (networkRef.current && networkRef.current.setData) {
        networkRef.current.setData({
          nodes: updatedNodes,
          edges: graphData.edges
        });
      }
    } catch (err) {
      console.error('Neo4jGraphViewer: Error updating selected node:', err);
      // Network might have been destroyed
      if (networkRef.current) {
        networkRef.current = null;
        setNetworkReady(false);
      }
    }
  }, [selectedNode, graphData]);

      // Cleanup on unmount
      useEffect(() => {
        return () => {
          if (interactionTimeoutRef.current) {
            clearTimeout(interactionTimeoutRef.current);
          }
          if (networkRef.current) {
            console.log('Neo4jGraphViewer: Cleanup on unmount');
            networkRef.current.destroy();
            networkRef.current = null;
            setNetworkReady(false);
          }
        };
      }, []);

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-sm text-slate-400">Loading graph...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center text-red-400">
          <p className="text-sm">Error: {error}</p>
          <button 
            onClick={fetchGraphData}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height: '100%', minHeight: '600px' }}>
      <div
        ref={containerRef}
        className="w-full h-full bg-slate-950 rounded-lg"
        style={{ 
          height: '100%', 
          minHeight: '600px',
          width: '100%'
        }}
      />
      
      {/* Stats Panel */}
      {graphData && (
        <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg shadow-lg p-3 text-xs backdrop-blur-sm">
          <div className="font-semibold mb-1 text-slate-200">Graph Stats</div>
          <div className="text-slate-400">Nodes: {graphData.meta.totalNodes}</div>
          <div className="text-slate-400">Edges: {graphData.meta.totalEdges}</div>
          <div className={`text-xs ${networkReady ? 'text-green-400' : 'text-yellow-400'}`}>
            {networkReady ? (isInteracting ? '🔄 Interacting...' : '✓ Ready') : '⏳ Loading...'}
          </div>
          {graphData.meta.hasMore && (
            <div className="text-blue-400">More data available</div>
          )}
          <button
            onClick={() => {
              if (networkRef.current) {
                networkRef.current.setOptions({
                  physics: {
                    enabled: true,
                    stabilization: { 
                      enabled: true, 
                      iterations: 1000,
                      updateInterval: 25,
                      fit: true
                    },
                    barnesHut: {
                      gravitationalConstant: -50000,
                      centralGravity: 0.01,
                      springLength: 600,
                      springConstant: 0.15,
                      damping: 0.9,
                      avoidOverlap: 0.95
                    },
                    solver: 'barnesHut',
                    maxVelocity: 50,
                    minVelocity: 0.05,
                    timestep: 0.25
                  }
                });
                console.log('Neo4jGraphViewer: Physics restarted manually');
              }
            }}
            className="mt-2 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500"
          >
            Restart Physics
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-slate-900/90 border border-slate-700 rounded-lg shadow-lg p-3 text-xs backdrop-blur-sm text-slate-300">
        <div className="font-semibold mb-2 text-slate-200">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{background: '#3b82f6'}}></div>
            <span>Person</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{background: '#94a3b8'}}></div>
            <span>Organization</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{background: '#8b5cf6'}}></div>
            <span>LinkedIn 1st°</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{background: '#10b981'}}></div>
            <span>Portfolio</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{background: '#f59e0b'}}></div>
            <span>Qualified</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{background: '#60a5fa'}}></div>
            <span>Investigate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{background: '#ef4444'}}></div>
            <span>Internal Owner</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default Neo4jGraphViewer;
