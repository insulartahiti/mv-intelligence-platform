'use client';

import { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

interface Neo4jVisNetworkProps {
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  onNodeHover?: (nodeId: string, nodeData: any) => void;
  className?: string;
  limit?: number;
  minImportance?: number;
}

export default function Neo4jVisNetwork({ 
  onNodeClick, 
  onNodeHover, 
  className = '',
  limit = 100,
  minImportance = 0.5
}: Neo4jVisNetworkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  
  // Use refs to store the latest callback functions
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeHoverRef = useRef(onNodeHover);
  
  // Update refs when props change
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onNodeHoverRef.current = onNodeHover;
  }, [onNodeClick, onNodeHover]);

  useEffect(() => {
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
      
      // Container should be available by now
      try {
        setLoading(true);
        setError(null);

        console.log('Neo4jVisNetwork: Making API call...');
        const response = await fetch(
          `/api/neo4j/neovis-data?limit=${limit}&minImportance=${minImportance}`
        );
        console.log('Neo4jVisNetwork: API response received:', response.status);
        
        const result = await response.json();
        console.log('Neo4jVisNetwork: API response:', { success: result.success, nodeCount: result.data?.nodes?.length });

        if (!response.ok) {
          throw new Error(result.message || 'Failed to load Neo4j data');
        }

        if (!isMounted) return;

        if (result.success) {
          const { nodes, edges, meta } = result.data;
          setStats(meta);

          // Convert to vis-network format
          const visNodes = new DataSet(
            nodes.map((node: any) => ({
              id: node.id,
              label: node.label,
              group: node.group,
              color: getNodeColor(node),
              size: getNodeSize(node),
              title: getNodeTooltip(node),
              properties: node.properties
            }))
          );

          const visEdges = new DataSet(
            edges.map((edge: any) => ({
              id: edge.id,
              from: edge.from,
              to: edge.to,
              label: edge.label,
              width: getEdgeWidth(edge),
              color: getEdgeColor(edge),
              title: getEdgeTooltip(edge),
              properties: edge.properties
            }))
          );

          // Create network
          const data = { nodes: visNodes, edges: visEdges };
          console.log('Neo4jVisNetwork: Creating network with', visNodes.length, 'nodes and', visEdges.length, 'edges');
          console.log('Neo4jVisNetwork: Container ref:', containerRef.current);
          
          const options = {
            nodes: {
              shape: 'dot',
              font: {
                size: 14,  // Increased font size
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
                color: '#000000'
              }
            },
            physics: {
              enabled: true,
              stabilization: {
                enabled: true,
                iterations: 100,
                updateInterval: 25,
                onlyDynamicEdges: false,
                fit: true
              },
              barnesHut: {
                gravitationalConstant: -12000,  // Increased repulsion
                centralGravity: 0.1,            // Reduced central pull
                springLength: 200,              // Increased preferred distance
                springConstant: 0.05,           // Reduced spring strength
                damping: 0.4,                   // Increased friction for stability
                avoidOverlap: 1.0               // Increased overlap avoidance
              },
              maxVelocity: 50,
              minVelocity: 0.1,
              solver: 'barnesHut',
              timestep: 0.5
            },
            interaction: {
              hover: true,
              hoverConnectedEdges: true,
              selectConnectedEdges: false
            },
            layout: {
              improvedLayout: false
            }
          };

          if (containerRef.current) {
            console.log('Neo4jVisNetwork: Creating Network instance...');
            networkRef.current = new Network(containerRef.current, data as any, options);
            console.log('Neo4jVisNetwork: Network created successfully');

            // Add event listeners
            networkRef.current.on('click', (params) => {
              if (params.nodes.length > 0 && onNodeClickRef.current) {
                const nodeId = params.nodes[0];
                const nodeData = visNodes.get(nodeId);
                onNodeClickRef.current(nodeId, nodeData);
              }
            });

            networkRef.current.on('hoverNode', (params) => {
              if (onNodeHoverRef.current) {
                const nodeData = visNodes.get(params.node);
                onNodeHoverRef.current(params.node, nodeData);
              }
            });

            // Re-enable physics on interaction for dynamic repositioning
            networkRef.current.on('zoom', () => {
              if (networkRef.current) {
                networkRef.current.setOptions({
                  physics: {
                    enabled: true,
                    stabilization: { enabled: false }
                  }
                });
              }
            });

            networkRef.current.on('dragStart', () => {
              if (networkRef.current) {
                networkRef.current.setOptions({
                  physics: {
                    enabled: true,
                    stabilization: { enabled: false }
                  }
                });
              }
            });

            // Re-stabilize after interactions settle
            networkRef.current.on('dragEnd', () => {
              if (networkRef.current) {
                setTimeout(() => {
                  if (networkRef.current) {
                    networkRef.current.setOptions({
                      physics: {
                        enabled: true,
                        stabilization: { enabled: true, iterations: 50 }
                      }
                    });
                  }
                }, 1000);
              }
            });

            console.log('Neo4jVisNetwork: Setting loading to false, network created successfully');
            clearTimeout(timeoutId);
            setLoading(false);
          } else {
            console.error('Neo4jVisNetwork: Container ref is null!');
            clearTimeout(timeoutId);
            throw new Error('Container not available');
          }
        } else {
          throw new Error(result.message || 'Failed to load data');
        }
      } catch (err: any) {
        console.error('Error loading Neo4j data:', err);
        clearTimeout(timeoutId);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    loadNeo4jData();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [limit, minImportance]);

  const getNodeColor = (node: any) => {
    const props = node.properties;
    if (props.is_internal) return '#dc2626'; // Red for internal
    if (props.type === 'person') return '#2563eb'; // Blue for person
    if (props.type === 'organization') return '#7c3aed'; // Purple for organization
    return '#6b7280'; // Gray default
  };

  const getNodeSize = (node: any) => {
    const importance = node.properties.importance || 0;
    return Math.max(15, Math.min(50, 15 + importance * 25)); // Increased base size and range
  };

  const getNodeTooltip = (node: any) => {
    const props = node.properties;
    let enrichmentInfo = '';
    
    if (props.enrichment_data) {
      try {
        const enrichment = JSON.parse(props.enrichment_data);
        if (enrichment.web_search_data) {
          const searchData = JSON.parse(enrichment.web_search_data);
          if (searchData.results && searchData.results.length > 0) {
            enrichmentInfo = `<br/>🔍 ${searchData.results.length} search results`;
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
    
    return `
      <div style="text-align: left; max-width: 300px;">
        <strong>${props.name || 'Unknown'}</strong><br/>
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
    const weight = edge.properties.weight || 0.5;
    return Math.max(1, Math.min(5, weight * 5));
  };

  const getEdgeColor = (edge: any) => {
    const kind = edge.properties.kind || edge.label;
    const colorMap: { [key: string]: string } = {
      'founder': '#ef4444',
      'works_at': '#3b82f6',
      'owner': '#10b981',
      'contact': '#f59e0b',
      'deal_team': '#8b5cf6',
      'RELATES': '#6b7280'
    };
    return colorMap[kind] || '#6b7280';
  };

  const getEdgeTooltip = (edge: any) => {
    const props = edge.properties;
    return `
      <div style="text-align: left;">
        <strong>${props.kind || edge.label}</strong><br/>
        Weight: ${(props.weight || 0.5).toFixed(2)}<br/>
        Strength: ${(props.strength_score || 0.5).toFixed(2)}
      </div>
    `;
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
            <p className="text-sm text-gray-600">Loading Neo4j graph...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50">
          <div className="text-center p-4">
            <p className="text-red-600 font-medium">Error loading graph</p>
            <p className="text-sm text-red-500 mt-1">{error}</p>
          </div>
        </div>
      )}
      
      {stats && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>{stats.totalNodes} nodes</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>{stats.totalEdges} edges</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
