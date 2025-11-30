'use client';

import { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

interface Neo4jVisNetworkProps {
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  onNodeHover?: (nodeId: string, nodeData: any) => void;
  highlightedNodeIds?: string[];
  subgraphData?: any; // New prop
  className?: string;
  limit?: number;
  minImportance?: number;
}

export default function Neo4jVisNetwork({ 
  onNodeClick, 
  onNodeHover, 
  highlightedNodeIds,
  subgraphData,
  className = '',
  limit = 100,
  minImportance = 0.5
}: Neo4jVisNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [visNodes, setVisNodes] = useState<DataSet<any> | null>(null);
  const [visEdges, setVisEdges] = useState<DataSet<any> | null>(null);
  
  // Ref to track highlights for dynamic updates
  const highlightedNodeIdsRef = useRef(highlightedNodeIds);

  // Helper: Render Graph Data
  const renderGraph = (nodes: any[], edges: any[]) => {
      // Convert to vis-network format
      const nodesArray = nodes.map((node: any) => ({
          id: node.id,
          label: node.label || node.properties?.name || node.name || 'Unknown',
          group: node.group || node.properties?.type || node.type || 'Entity',
          color: getNodeColor(node, highlightedNodeIdsRef.current || []),
          size: getNodeSize(node),
          title: getNodeTooltip(node),
          properties: node.properties || node,
          originalProps: node
      }));

      const edgesArray = edges.map((edge: any) => ({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          label: edge.label,
          width: getEdgeWidth(edge),
          color: getEdgeColor(edge),
          title: getEdgeTooltip(edge),
          properties: edge.properties || edge
      }));

      const newVisNodes = new DataSet(nodesArray);
      const newVisEdges = new DataSet(edgesArray);
      
      setVisNodes(newVisNodes);
      setVisEdges(newVisEdges);
      setStats({ totalNodes: nodes.length, totalEdges: edges.length });

      if (containerRef.current && !networkRef.current) {
          // Initial creation
          console.log('Neo4jVisNetwork: Creating Initial Network');
          networkRef.current = new Network(
              containerRef.current, 
              { nodes: newVisNodes, edges: newVisEdges }, 
              getOptions()
          );
          setupEvents(networkRef.current, newVisNodes);
      } else if (networkRef.current) {
          // Update existing
          console.log('Neo4jVisNetwork: Updating Data');
          networkRef.current.setData({ nodes: newVisNodes, edges: newVisEdges });
          
          // Only stabilize/fit if it's a completely new graph to avoid jumping
          // If we are just updating highlights, we shouldn't re-fit usually, 
          // but here we are swapping the whole dataset (e.g. subgraph), so yes fit.
          if (subgraphData) {
              networkRef.current.fit({ animation: true });
          }
      }
      
      setLoading(false);
  };

  // Effect to handle Subgraph Updates
  useEffect(() => {
      if (subgraphData) {
          console.log('Neo4jVisNetwork: Rendering Subgraph', subgraphData);
          renderGraph(subgraphData.nodes, subgraphData.edges);
      }
  }, [subgraphData]);

  // Effect to handle Initial Load (only if no subgraph)
  useEffect(() => {
    if (subgraphData) return; // Skip initial load if subgraph provided

    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const loadNeo4jData = async () => {
      console.log('Neo4jVisNetwork: Starting to load data...');
      
      // Set a timeout to prevent infinite loading
      timeoutId = setTimeout(() => {
        if (isMounted) {
          console.error('Neo4jVisNetwork: Loading timeout after 10 seconds');
          setError('Loading timeout - please refresh the page');
          setLoading(false);
        }
      }, 10000);
      
      try {
        setLoading(true);
        setError(null);

        console.log('Neo4jVisNetwork: Making API call...');
        const response = await fetch(
          `/api/neo4j/neovis-data?limit=${limit}&minImportance=${minImportance}`
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to load Neo4j data');
        }

        if (!isMounted) return;

        if (result.success) {
          const { nodes, edges, meta } = result.data;
          renderGraph(nodes, edges);
        }
      } catch (err: any) {
        console.error('Error loading Neo4j data:', err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };
    
    if (!subgraphData) {
        loadNeo4jData();
    }
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (networkRef.current) {
        // networkRef.current.destroy(); // Don't destroy ref on every effect run, only on unmount really.
        // But here we might want to keep it.
      }
    };
  }, [limit, minImportance, subgraphData]); // Add subgraphData dep

  // Update highlights ref and trigger re-render of colors
  useEffect(() => {
      highlightedNodeIdsRef.current = highlightedNodeIds;
      if (visNodes && highlightedNodeIds) {
          const updates = visNodes.get().map((node: any) => ({
              id: node.id,
              color: getNodeColor(node.originalProps, highlightedNodeIds)
          }));
          visNodes.update(updates);
          
          // REMOVED: Auto-fit on highlight to prevent jumping
          // If the user wants to focus, they can click a button (feature for later)
          // or we only do it if the user hasn't interacted yet. 
          // For now, stability is preferred.
      }
  }, [highlightedNodeIds, visNodes]);

  // Helpers
  const getOptions = () => ({
    nodes: {
        shape: 'dot',
        font: {
          size: 14,
          color: '#e2e8f0', 
          strokeWidth: 0,
          face: 'Inter, system-ui, sans-serif'
        },
        borderWidth: 2,
        shadow: true
    },
    edges: {
        width: 1.5,
        color: { color: '#475569', highlight: '#3b82f6' }, 
        smooth: {
          enabled: true,
          type: 'continuous',
          forceDirection: 'none',
          roundness: 0.3
        },
        arrows: {
          to: { enabled: true, scaleFactor: 0.5 }
        },
        font: {
          size: 10,
          color: '#94a3b8',
          strokeWidth: 0,
          align: 'top'
        }
    },
    physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          iterations: 200, // Reduced iterations for faster updates
          updateInterval: 25,
          onlyDynamicEdges: false,
          fit: false // CRITICAL: Disable auto-fit during stabilization to prevent jumping
        },
        barnesHut: {
          gravitationalConstant: -3000, // Weaker gravity so nodes don't fly apart
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
          avoidOverlap: 0
        },
        minVelocity: 0.75,
        solver: 'barnesHut',
        timestep: 0.5,
        adaptiveTimestep: true
    },
    interaction: { 
        hover: true,
        zoomView: true,
        dragView: true,
        navigationButtons: true,
        keyboard: true,
        multiselect: true,
        zoomSpeed: 0.5 // Slower zoom for better control
    }
  });

  const setupEvents = (network: Network, nodes: DataSet<any>) => {
      network.on('click', (params) => {
          if (params.nodes.length > 0 && onNodeClickRef.current) {
              const nodeId = params.nodes[0];
              const nodeData = nodes.get(nodeId);
              onNodeClickRef.current(nodeId, nodeData);
          }
      });
      
      network.on('hoverNode', (params) => {
          if (onNodeHoverRef.current) {
            const nodeData = nodes.get(params.node);
            onNodeHoverRef.current(params.node, nodeData);
          }
      });
  };

  const getNodeColor = (node: any, highlights: string[]) => {
    const props = node.properties || node;
    const isHighlighted = highlights && highlights.includes(node.id);
    
    if (isHighlighted) return '#fbbf24'; // Amber-400 for highlight

    if (props.is_internal) return '#ef4444'; // Red-500
    if (props.type === 'person') return '#3b82f6'; // Blue-500
    if (props.type === 'organization') return '#8b5cf6'; // Violet-500
    return '#64748b'; // Slate-500
  };

  const getNodeSize = (node: any) => {
    const props = node.properties || node;
    const importance = props.importance || 0;
    return Math.max(15, Math.min(50, 15 + importance * 25));
  };

  const getNodeTooltip = (node: any) => {
    // Tooltip HTML can be styled but it's raw HTML, so hard to use tailwind classes inside without compilation.
    // We'll use inline styles for dark mode.
    const props = node.properties || node;
    let enrichmentInfo = '';
    
    if (props.enrichment_data) {
      try {
        const enrichment = typeof props.enrichment_data === 'string' ? JSON.parse(props.enrichment_data) : props.enrichment_data;
        if (enrichment.web_search_data) {
          const searchData = typeof enrichment.web_search_data === 'string' ? JSON.parse(enrichment.web_search_data) : enrichment.web_search_data;
          if (searchData.results && searchData.results.length > 0) {
            enrichmentInfo = `<br/>🔍 ${searchData.results.length} search results`;
          }
        }
      } catch (e) { }
    }
    
    return `
      <div style="text-align: left; max-width: 300px; color: #e2e8f0; background: #0f172a; padding: 8px; border-radius: 4px; border: 1px solid #334155;">
        <strong style="color: #60a5fa;">${props.name || 'Unknown'}</strong><br/>
        Type: ${props.type || 'Entity'}<br/>
        Importance: ${(props.importance || 0).toFixed(2)}<br/>
        ${props.industry ? `Industry: ${props.industry}<br/>` : ''}
        ${props.domain ? `Domain: ${props.domain}<br/>` : ''}
        ${props.is_internal ? '🏢 Internal Owner<br/>' : ''}
        ${props.is_portfolio ? '💼 Portfolio Company<br/>' : ''}
        ${props.is_pipeline ? '📈 Pipeline Company<br/>' : ''}
        ${props.linkedin_url ? '🔗 LinkedIn Available<br/>' : ''}
        ${enrichmentInfo}
      </div>
    `;
  };

  const getEdgeWidth = (edge: any) => {
    const props = edge.properties || edge;
    const weight = props.weight || 0.5;
    return Math.max(1, Math.min(5, weight * 5));
  };

  const getEdgeColor = (edge: any) => {
    const props = edge.properties || edge;
    const kind = props.kind || edge.label;
    const colorMap: { [key: string]: string } = {
      'founder': '#ef4444',
      'works_at': '#3b82f6',
      'owner': '#10b981',
      'contact': '#f59e0b',
      'deal_team': '#8b5cf6',
      'RELATES': '#64748b'
    };
    return colorMap[kind] || '#64748b';
  };

  const getEdgeTooltip = (edge: any) => {
    const props = edge.properties || edge;
    return `
      <div style="text-align: left; color: #e2e8f0; background: #0f172a; padding: 4px; border-radius: 4px; border: 1px solid #334155;">
        <strong>${props.kind || edge.label}</strong><br/>
        Weight: ${(props.weight || 0.5).toFixed(2)}<br/>
        Strength: ${(props.strength_score || 0.5).toFixed(2)}
      </div>
    `;
  };

  // Use refs to store the latest callback functions
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeHoverRef = useRef(onNodeHover);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onNodeHoverRef.current = onNodeHover;
  }, [onNodeClick, onNodeHover]);

  return (
    <div className={`relative ${className} w-full h-full`}>
      <div
        ref={containerRef}
        className="w-full h-full bg-slate-950 rounded-lg" // Dark Mode bg
      />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-sm text-slate-400">Loading Knowledge Graph...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 z-10">
          <div className="text-center p-6 bg-slate-900 border border-red-900/50 rounded-xl">
            <p className="text-red-400 font-medium mb-1">Error loading graph</p>
            <p className="text-sm text-red-500/80">{error}</p>
          </div>
        </div>
      )}
      
      {stats && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg shadow-lg p-3 text-xs text-slate-300">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
              <span>{stats.totalNodes} nodes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-slate-500 rounded-full"></div>
              <span>{stats.totalEdges} edges</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
