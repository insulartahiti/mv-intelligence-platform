'use client';

import { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

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
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight?: number;
  strength_score?: number;
};

type GraphPayload = {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  entities?: any[]; // Full dataset format
};

interface VisNetworkGraphProps {
  data: GraphPayload;
  onNodeClick: (nodeId: string) => void;
  filters?: {
    nodeTypes?: string[];
    pipelineStages?: string[];
    funds?: string[];
    showInternalOnly?: boolean;
    showLinkedInOnly?: boolean;
  };
}

// Helper function to normalize data format
const normalizeData = (data: GraphPayload) => {
  if (data.entities && data.edges) {
    // Full dataset format - convert entities to nodes
    const nodes = data.entities.map(entity => ({
      id: entity.id,
      label: entity.name,
      type: entity.type === 'person' ? 'person' : 'company',
      internal_owner: entity.is_internal,
      size: Math.max(6, Math.min(20, 6 + Math.log(1 + (entity.connection_count || 0)) * 3)),
      industry: entity.industry,
      title: entity.brief_description,
      domain: entity.domain,
      linkedin_first_degree: entity.linkedin_first_degree,
      affinity_strength: entity.importance,
      pipeline_stage: entity.pipeline_stage,
      fund: entity.fund,
      connection_count: entity.connection_count || 0,
      ...entity
    }));
    
    const edges = data.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind || "relationship",
      weight: edge.strength_score || 0.5,
      strength_score: edge.strength_score || 0.5
    }));

    return { nodes, edges };
  } else if (data.nodes && data.edges) {
    // Legacy format
    return { nodes: data.nodes, edges: data.edges };
  } else {
    return { nodes: [], edges: [] };
  }
};

export default function VisNetworkGraph({ data, onNodeClick, filters }: VisNetworkGraphProps) {
  const networkRef = useRef<HTMLDivElement>(null);
  const networkInstance = useRef<Network | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper function to get node color based on type and properties
  const getNodeColor = (node: GraphNode) => {
    if (node.internal_owner) {
      return {
        background: '#dc2626', // Red for internal owners
        border: '#b91c1c',
        highlight: {
          background: '#ef4444',
          border: '#dc2626',
        },
      };
    }
    
    if (node.type === 'person') {
      if (node.linkedin_first_degree) {
        return {
          background: '#7c3aed', // Purple for LinkedIn 1st degree
          border: '#6d28d9',
          highlight: {
            background: '#8b5cf6',
            border: '#7c3aed',
          },
        };
      }
      return {
        background: '#2563eb', // Blue for regular people
        border: '#1d4ed8',
        highlight: {
          background: '#3b82f6',
          border: '#2563eb',
        },
      };
    }
    
    if (node.type === 'company' || node.type === 'organization') {
      // Color by pipeline stage if available
      if (node.pipeline_stage) {
        switch (node.pipeline_stage.toLowerCase()) {
          case 'qualified':
            return {
              background: '#f59e0b', // Amber for qualified
              border: '#d97706',
              highlight: {
                background: '#fbbf24',
                border: '#f59e0b',
              },
            };
          case 'due diligence':
            return {
              background: '#3b82f6', // Blue for due diligence
              border: '#2563eb',
              highlight: {
                background: '#60a5fa',
                border: '#3b82f6',
              },
            };
          case 'portfolio':
            return {
              background: '#059669', // Green for portfolio
              border: '#047857',
              highlight: {
                background: '#10b981',
                border: '#059669',
              },
            };
          default:
            return {
              background: '#6b7280', // Gray for unknown
              border: '#4b5563',
              highlight: {
                background: '#9ca3af',
                border: '#6b7280',
              },
            };
        }
      }
      
      return {
        background: '#059669', // Default green for organizations
        border: '#047857',
        highlight: {
          background: '#10b981',
          border: '#059669',
        },
      };
    }
    
    return {
      background: '#6b7280', // Default gray
      border: '#4b5563',
      highlight: {
        background: '#9ca3af',
        border: '#6b7280',
      },
    };
  };

  // Helper function to get node size based on connections and importance
  const getNodeSize = (node: GraphNode) => {
    const baseSize = 20;
    const sizeMultiplier = node.size || 1;
    const connectionCount = data.edges?.filter(e => e.source === node.id || e.target === node.id).length || 0;
    
    // Scale size based on connections and internal owner status
    let size = baseSize + (connectionCount * 2) + (node.internal_owner ? 10 : 0);
    
    return Math.min(Math.max(size * sizeMultiplier, 15), 50);
  };

  useEffect(() => {
    const normalizedData = normalizeData(data);
    if (!networkRef.current || !normalizedData.nodes.length || !normalizedData.edges) return;

    // Filter nodes based on filters
    let filteredNodes = normalizedData.nodes;
    if (filters) {
      filteredNodes = normalizedData.nodes.filter(node => {
        if (filters.nodeTypes && filters.nodeTypes.length > 0 && !filters.nodeTypes.includes(node.type)) return false;
        if (filters.pipelineStages && filters.pipelineStages.length > 0 && node.pipeline_stage && !filters.pipelineStages.includes(node.pipeline_stage)) return false;
        if (filters.funds && filters.funds.length > 0 && node.fund && !filters.funds.includes(node.fund)) return false;
        if (filters.showInternalOnly && !node.is_internal) return false;
        if (filters.showLinkedInOnly && !node.is_pipeline) return false; // Using is_pipeline as proxy for LinkedIn connections
        return true;
      });
    }

    // Deduplicate nodes by ID to prevent duplicate ID errors
    const uniqueNodes = filteredNodes.reduce((acc, node) => {
      if (!acc.find((n: any) => n.id === node.id)) {
        acc.push(node);
      }
      return acc;
    }, [] as GraphNode[]);

    // Create nodes dataset
    const nodes = new DataSet(
      uniqueNodes.map((node: any) => ({
        id: node.id,
        label: node.label,
        color: getNodeColor(node),
        borderWidth: node.is_internal ? 4 : 2,
        shape: node.is_internal ? 'star' : (node.type === 'person' ? 'dot' : 'box'),
        size: getNodeSize(node),
        font: {
          color: '#ffffff',
          size: Math.max(10, Math.min(16, getNodeSize(node) / 2)),
          face: 'Inter, sans-serif',
          bold: node.is_internal,
        },
        title: `
          <div style="padding: 12px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 200px;">
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; color: #1f2937;">${node.label}</div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">Type: <span style="color: #374151; font-weight: 500;">${node.type}</span></div>
            ${node.is_internal ? '<div style="color: #dc2626; font-weight: bold; font-size: 12px; margin-bottom: 4px;">⭐ Internal Owner</div>' : ''}
            ${node.pipeline_stage ? `<div style="font-size: 12px; color: #6b7280;">Stage: <span style="color: #374151; font-weight: 500;">${node.pipeline_stage}</span></div>` : ''}
            ${node.fund ? `<div style="font-size: 12px; color: #6b7280;">Fund: <span style="color: #374151; font-weight: 500;">${node.fund}</span></div>` : ''}
            ${node.industry ? `<div style="font-size: 12px; color: #6b7280;">Industry: <span style="color: #374151; font-weight: 500;">${node.industry}</span></div>` : ''}
            ${node.domain ? `<div style="font-size: 12px; color: #6b7280;">Domain: <span style="color: #374151; font-weight: 500;">${node.domain}</span></div>` : ''}
            ${node.is_pipeline ? '<div style="color: #7c3aed; font-weight: bold; font-size: 12px;">🔗 Pipeline Company</div>' : ''}
            ${node.affinity_strength ? `<div style="font-size: 12px; color: #6b7280;">Affinity: <span style="color: #374151; font-weight: 500;">${node.affinity_strength}</span></div>` : ''}
          </div>
        `,
      }))
    );

    // Filter edges to only include those connecting visible nodes
    const visibleNodeIds = new Set(uniqueNodes.map((n: any) => n.id));
    const filteredEdges = normalizedData.edges.filter(edge => 
      visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    // Deduplicate edges by ID to prevent duplicate ID errors
    const uniqueEdges = filteredEdges.reduce((acc, edge) => {
      if (!acc.find(e => e.id === edge.id)) {
        acc.push(edge);
      }
      return acc;
    }, [] as any[]);

    // Create edges dataset
    const edges = new DataSet(
      uniqueEdges.map(edge => {
        const sourceNode = normalizedData.nodes.find(n => n.id === edge.source);
        const targetNode = normalizedData.nodes.find(n => n.id === edge.target);
        const isInternalOwnerEdge = sourceNode?.is_internal || targetNode?.is_internal;
        const strength = edge.strength_score || edge.weight || 1;
        
        // Color edges based on relationship type and strength
        let edgeColor = '#6b7280'; // Default gray
        if (isInternalOwnerEdge) {
          edgeColor = '#dc2626'; // Red for internal owner connections
        } else {
          switch (edge.kind.toLowerCase()) {
            case 'owner':
            case 'owns':
              edgeColor = '#059669'; // Green for ownership
              break;
            case 'deal_team':
            case 'deal team':
              edgeColor = '#3b82f6'; // Blue for deal team
              break;
            case 'contact':
            case 'contacts':
              edgeColor = '#7c3aed'; // Purple for contacts
              break;
            case 'founder':
            case 'founded':
              edgeColor = '#f59e0b'; // Amber for founders
              break;
            case 'advisor':
            case 'advises':
              edgeColor = '#06b6d4'; // Cyan for advisors
              break;
            default:
              edgeColor = '#6b7280'; // Gray for other relationships
          }
        }
        
        return {
          id: edge.id,
          from: edge.source,
          to: edge.target,
          label: edge.kind.replace(/_/g, ' ').replace(/\b\w/g, (l: any) => l.toUpperCase()),
          color: {
            color: edgeColor,
            highlight: edgeColor,
            opacity: Math.max(0.3, Math.min(1, strength)),
          },
          width: Math.max(1, Math.min(6, strength * 3)),
          font: {
            color: edgeColor,
            size: Math.max(10, Math.min(14, strength * 12)),
            face: 'Inter, sans-serif',
          },
          dashes: isInternalOwnerEdge ? [8, 4] : false,
          smooth: {
            enabled: true,
            type: 'continuous',
            forceDirection: 'none',
            roundness: 0.5
          },
          title: `
            <div style="padding: 8px; background: white; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <div style="font-weight: bold; color: #1f2937; margin-bottom: 4px;">${edge.kind.replace(/_/g, ' ').replace(/\b\w/g, (l: any) => l.toUpperCase())}</div>
              <div style="font-size: 12px; color: #6b7280;">Strength: ${(strength * 100).toFixed(0)}%</div>
              ${isInternalOwnerEdge ? '<div style="color: #dc2626; font-weight: bold; font-size: 12px;">⭐ Internal Connection</div>' : ''}
            </div>
          `,
        };
      })
    );

    // Enhanced network configuration
    const options = {
      nodes: {
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.15)',
          size: 8,
          x: 3,
          y: 3,
        },
        chosen: {
          node: (values: any, id: string, selected: boolean, hovering: boolean) => {
            if (selected || hovering) {
              values.shadow = true;
              values.shadowColor = 'rgba(59, 130, 246, 0.5)';
              values.shadowSize = 15;
              values.shadowX = 0;
              values.shadowY = 0;
            }
          },
        },
      },
      edges: {
        width: 2,
        color: {
          color: '#6b7280',
          highlight: '#3b82f6',
          hover: '#3b82f6'
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 0.8,
            type: 'arrow'
          }
        },
        smooth: {
          type: 'continuous',
          forceDirection: 'none',
          roundness: 0.5,
        },
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.1)',
          size: 4,
          x: 2,
          y: 2,
        },
        chosen: {
          edge: (values: any, id: string, selected: boolean, hovering: boolean) => {
            if (selected || hovering) {
              values.shadow = true;
              values.shadowColor = 'rgba(59, 130, 246, 0.3)';
              values.shadowSize = 8;
            }
          },
        },
      },
      physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          iterations: 50, // Reduced for better performance
          updateInterval: 25,
          onlyDynamicEdges: false,
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -2000, // Reduced for better performance
          centralGravity: 0.1,
          springLength: 95,
          springConstant: 0.04,
          damping: 0.09,
          avoidOverlap: 0.1,
        },
        maxVelocity: 30, // Reduced for better performance
        minVelocity: 0.1,
        solver: 'barnesHut',
        timestep: 0.5,
      },
      interaction: {
        hover: true,
        hoverConnectedEdges: true,
        selectConnectedEdges: true,
        dragNodes: true,
        dragView: true,
        zoomView: true,
        zoomSpeed: 0.5,
        keyboard: {
          enabled: true,
          speed: { x: 10, y: 10, zoom: 0.02 },
          bindToWindow: true,
        },
        multiselect: true,
        selectable: true,
        tooltipDelay: 300,
      },
      layout: {
        improvedLayout: false, // Disabled for better performance with large datasets
        clusterThreshold: 200,
        hierarchical: {
          enabled: false,
          sortMethod: 'directed',
        },
      },
      configure: {
        enabled: false,
      },
      groups: {
        person: {
          shape: 'dot',
          color: {
            background: '#2563eb',
            border: '#1d4ed8',
          },
        },
        organization: {
          shape: 'box',
          color: {
            background: '#059669',
            border: '#047857',
          },
        },
        internal_owner: {
          shape: 'star',
          color: {
            background: '#dc2626',
            border: '#b91c1c',
          },
        },
      },
    };

    // Create network
    const network = new Network(networkRef.current, { nodes: nodes as any, edges: edges as any }, options as any);
    networkInstance.current = network;

    // Add event listeners
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        console.log('Node clicked:', nodeId, 'Type:', typeof nodeId);
        onNodeClick(nodeId);
      }
    });

    // Handle double-click to fit selected nodes
    network.on('doubleClick', (params) => {
      if (params.nodes.length > 0) {
        network.focus(params.nodes[0], {
          scale: 1.5,
          animation: {
            duration: 1000,
            easingFunction: 'easeInOutQuad',
          },
        });
      }
    });

    // Handle zoom events for better UX
    network.on('zoom', (params) => {
      // Optional: Add zoom level indicators or controls
    });

    // Handle selection changes
    network.on('select', (params) => {
      if (params.nodes.length > 0) {
        // Optional: Highlight connected nodes or show additional info
      }
    });

    // Initial fit to screen with animation
    network.once('stabilizationIterationsDone', () => {
      network.fit({
        animation: {
          duration: 1000,
          easingFunction: 'easeInOutQuad',
        },
      });
      setIsLoading(false);
    });

    // Cleanup
    return () => {
      if (networkInstance.current) {
        networkInstance.current.destroy();
        networkInstance.current = null;
      }
    };
  }, [data, onNodeClick, filters]);

  return (
    <div className="w-full h-full min-h-[400px] relative bg-gray-50 rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
          <div className="flex flex-col items-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div className="text-gray-600 font-medium">Loading network...</div>
            <div className="text-sm text-gray-500">Stabilizing graph layout</div>
          </div>
        </div>
      )}
      <div ref={networkRef} className="w-full h-full" />
      
      {/* Graph controls overlay */}
      {!isLoading && (
        <div className="absolute top-4 right-4 flex flex-col space-y-2">
          <button
            onClick={() => {
              if (networkInstance.current) {
                networkInstance.current.fit({
                  animation: {
                    duration: 1000,
                    easingFunction: 'easeInOutQuad',
                  },
                });
              }
            }}
            className="px-3 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:bg-gray-50 text-sm font-medium border border-gray-200"
            title="Fit to screen"
          >
            📐 Fit
          </button>
          <button
            onClick={() => {
              if (networkInstance.current) {
                const scale = networkInstance.current.getScale();
                networkInstance.current.moveTo({
                  scale: Math.min(scale * 1.2, 2),
                  animation: {
                    duration: 500,
                    easingFunction: 'easeInOutQuad',
                  },
                });
              }
            }}
            className="px-3 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:bg-gray-50 text-sm font-medium border border-gray-200"
            title="Zoom in"
          >
            🔍+
          </button>
          <button
            onClick={() => {
              if (networkInstance.current) {
                const scale = networkInstance.current.getScale();
                networkInstance.current.moveTo({
                  scale: Math.max(scale * 0.8, 0.1),
                  animation: {
                    duration: 500,
                    easingFunction: 'easeInOutQuad',
                  },
                });
              }
            }}
            className="px-3 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:bg-gray-50 text-sm font-medium border border-gray-200"
            title="Zoom out"
          >
            🔍-
          </button>
        </div>
      )}
    </div>
  );
}
