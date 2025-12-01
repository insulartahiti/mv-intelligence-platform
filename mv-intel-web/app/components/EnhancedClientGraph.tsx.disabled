'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Graph from 'graphology';
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import { LayoutForceAtlas2Control } from '@react-sigma/layout-forceatlas2';
// import { LayoutCircularControl } from '@react-sigma/layout-circular';
import { GraphSearch } from '@react-sigma/graph-search';
import NoverlapLayout from 'graphology-layout-noverlap';
import { circular } from 'graphology-layout';
import forceAtlas2 from 'graphology-layout-forceatlas2';

// Types
import { Entity, Edge, GraphData } from '../../lib/types';

interface ClusterData {
  id: string;
  label: string;
  color: string;
  entities: Entity[];
}

interface LayoutConfig {
  type: 'forceatlas2' | 'circular' | 'fruchterman' | 'noverlap';
  iterations: number;
  settings: Record<string, any>;
}

interface EnhancedClientGraphProps {
  data: GraphData;
  onNodeClick?: (node: Entity) => void;
  onEdgeClick?: (edge: Edge) => void;
  onNodeHover?: (node: Entity | null) => void;
  layout: LayoutConfig;
  clusters: ClusterData[];
  highlightedPath: string[];
  showMinimap: boolean;
  calculateNodeSize: (entity: Entity, edges: Edge[]) => number;
  calculateEdgeStyle: (edge: Edge) => { size: number; opacity: number; color: string };
}

// Custom component to handle trackpad gestures and enhanced interactions
function EnhancedTrackpadGestures({ onNodeHover }: { onNodeHover?: (node: Entity | null) => void }) {
  const sigma = useSigma();
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!sigma || !containerRef.current) return;

    const container = containerRef.current;
    
    // Handle wheel events for trackpad zoom and pan
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      if (e.ctrlKey || e.metaKey) {
        // Pinch to zoom
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const camera = sigma.getCamera();
        camera.animatedZoom({ duration: 100, factor: delta });
      } else {
        // Pan
        const camera = sigma.getCamera();
        const factor = 0.1;
        camera.setState({
          x: camera.x - e.deltaX * factor,
          y: camera.y - e.deltaY * factor
        });
      }
    };

    // Handle node hover with debouncing
    const handleNodeHover = (e: any) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      hoverTimeoutRef.current = setTimeout(() => {
        if (e.node) {
          const nodeData = sigma.getGraph().getNodeAttributes(e.node);
          onNodeHover?.(nodeData as Entity);
        } else {
          onNodeHover?.(null);
        }
      }, 100);
    };

    // Handle node click
    const handleNodeClick = (e: any) => {
      if (e.node) {
        const nodeData = sigma.getGraph().getNodeAttributes(e.node);
        // Find the original entity data
        const entity = sigma.getGraph().getAttribute('entities')?.find((e: Entity) => e.id === nodeData.id);
        if (entity) {
          // Trigger node click through the graph
          const event = new CustomEvent('nodeClick', { detail: entity });
          container.dispatchEvent(event);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    sigma.on('enterNode', handleNodeHover);
    sigma.on('leaveNode', () => onNodeHover?.(null));
    sigma.on('clickNode', handleNodeClick);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      sigma.off('enterNode', handleNodeHover);
      sigma.off('leaveNode', () => onNodeHover?.(null));
      sigma.off('clickNode', handleNodeClick);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [sigma, onNodeHover]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// Graph loader component with enhanced features
function EnhancedGraphLoader({ 
  data, 
  layout, 
  clusters, 
  highlightedPath, 
  calculateNodeSize, 
  calculateEdgeStyle 
}: {
  data: GraphData;
  layout: LayoutConfig;
  clusters: ClusterData[];
  highlightedPath: string[];
  calculateNodeSize: (entity: Entity, edges: Edge[]) => number;
  calculateEdgeStyle: (edge: Edge) => { size: number; opacity: number; color: string };
}) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();

  useEffect(() => {
    if (!data.entities.length) return;

    const graph = new Graph();

    // Create cluster mapping
    const clusterMap = new Map<string, ClusterData>();
    clusters.forEach(cluster => {
      cluster.entities.forEach(entity => {
        clusterMap.set(entity.id, cluster);
      });
    });

    // Add nodes with enhanced styling
    data.entities.forEach(entity => {
      const cluster = clusterMap.get(entity.id);
      const nodeSize = calculateNodeSize(entity, data.edges);
      
      graph.addNode(entity.id, {
        ...entity,
        label: entity.name,
        size: nodeSize,
        color: cluster?.color || '#95A5A6',
        x: Math.random() * 1000 - 500,
        y: Math.random() * 1000 - 500,
        // Enhanced node attributes
        clusterId: cluster?.id,
        clusterLabel: cluster?.label,
        // Visual indicators
        borderColor: entity.is_internal ? '#FF6B6B' : entity.is_portfolio ? '#4ECDC4' : '#E0E0E0',
        borderSize: entity.is_internal ? 3 : entity.is_portfolio ? 2 : 1,
        // Hover effects
        hoverColor: '#FFD700',
        hoverSize: nodeSize * 1.2
      });
    });

    // Add edges with enhanced styling
    data.edges.forEach(edge => {
      const edgeStyle = calculateEdgeStyle(edge);
      
      try {
        // Use the same pattern as working ClientGraph
        const key = edge.id || `${edge.source}->${edge.target}-${edge.kind}`;
        graph.addEdge(edge.source, edge.target, {
          key,
          size: edgeStyle.size,
          color: edgeStyle.color,
          opacity: edgeStyle.opacity,
          strength: edge.strength_score || 0.5,
          kind: edge.kind,
          hoverColor: '#FF6B6B',
          hoverSize: edgeStyle.size * 1.5
        });
      } catch (error) {
        console.warn('Error adding edge:', error);
      }
    });

    // Store original data for reference
    graph.setAttribute('entities', data.entities);
    graph.setAttribute('edges', data.edges);

    // Apply layout
    applyLayout(graph, layout);

    // Highlight path if provided
    if (highlightedPath.length > 0) {
      highlightedPath.forEach(nodeId => {
        if (graph.hasNode(nodeId)) {
          graph.setNodeAttribute(nodeId, 'highlighted', true);
          graph.setNodeAttribute(nodeId, 'color', '#FFD700');
          graph.setNodeAttribute(nodeId, 'size', graph.getNodeAttribute(nodeId, 'size') * 1.5);
        }
      });

      // Highlight edges in path
      for (let i = 0; i < highlightedPath.length - 1; i++) {
        const edgeId = graph.edge(highlightedPath[i], highlightedPath[i + 1]);
        if (edgeId) {
          graph.setEdgeAttribute(edgeId, 'highlighted', true);
          graph.setEdgeAttribute(edgeId, 'color', '#FFD700');
          graph.setEdgeAttribute(edgeId, 'size', graph.getEdgeAttribute(edgeId, 'size') * 2);
        }
      }
    }

    loadGraph(graph);

    // Apply additional layout iterations after load
    setTimeout(() => {
      if (layout.type === 'forceatlas2') {
        forceAtlas2.assign(graph, {
          iterations: layout.iterations,
          settings: layout.settings
        });
        sigma.refresh();
      }
    }, 100);

  }, [data, layout, clusters, highlightedPath, calculateNodeSize, calculateEdgeStyle, loadGraph, sigma]);

  return null;
}

// Apply layout algorithm
function applyLayout(graph: Graph, layout: LayoutConfig) {
  switch (layout.type) {
    case 'circular':
      circular.assign(graph, layout.settings);
      break;
    case 'noverlap':
      NoverlapLayout.assign(graph, layout.settings);
      break;
    case 'forceatlas2':
      // Will be applied after load
      break;
    case 'fruchterman':
      // Fruchterman-Reingold would need to be implemented
      // For now, use circular as fallback
      circular.assign(graph, layout.settings);
      break;
    default:
      circular.assign(graph, layout.settings);
  }
}

// Main enhanced client graph component
const EnhancedClientGraph: React.FC<EnhancedClientGraphProps> = ({
  data,
  onNodeClick,
  onEdgeClick,
  onNodeHover,
  layout,
  clusters,
  highlightedPath,
  showMinimap,
  calculateNodeSize,
  calculateEdgeStyle
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle node click events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNodeClick = (e: CustomEvent) => {
      onNodeClick?.(e.detail);
    };

    container.addEventListener('nodeClick', handleNodeClick as EventListener);
    return () => {
      container.removeEventListener('nodeClick', handleNodeClick as EventListener);
    };
  }, [onNodeClick]);

  // Handle loading state
  useEffect(() => {
    if (data.entities.length > 0) {
      setIsLoading(false);
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <SigmaContainer
        settings={{
          renderLabels: true,
          defaultNodeColor: '#2563eb',
          defaultEdgeColor: '#6b7280',
          labelFont: 'Inter, sans-serif',
          labelSize: 14,
          labelWeight: 'bold',
          zIndex: true,
          allowInvalidContainer: true,
          enableEdgeEvents: true,
        }}
      >
        <EnhancedGraphLoader
          data={data}
          layout={layout}
          clusters={clusters}
          highlightedPath={highlightedPath}
          calculateNodeSize={calculateNodeSize}
          calculateEdgeStyle={calculateEdgeStyle}
        />
        
        <EnhancedTrackpadGestures onNodeHover={onNodeHover} />
        
        <ControlsContainer position="top-right">
          <ZoomControl />
          <FullScreenControl />
          <LayoutForceAtlas2Control />
        </ControlsContainer>
      </SigmaContainer>
    </div>
  );
};

export default EnhancedClientGraph;
