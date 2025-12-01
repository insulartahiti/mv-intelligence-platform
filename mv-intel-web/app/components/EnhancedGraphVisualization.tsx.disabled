'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { GraphData, Entity, Edge } from '../../lib/types';

// Dynamic import to avoid SSR issues
const EnhancedClientGraph = dynamic(() => import('./EnhancedClientGraph'), { ssr: false });

interface EnhancedGraphVisualizationProps {
  data: GraphData;
  onNodeClick?: (node: Entity) => void;
  onEdgeClick?: (edge: Edge) => void;
  searchQuery?: string;
  filters?: {
    entityTypes?: string[];
    pipelineStages?: string[];
    isInternal?: boolean;
    isPortfolio?: boolean;
    isPipeline?: boolean;
  };
  className?: string;
}

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

const EnhancedGraphVisualization: React.FC<EnhancedGraphVisualizationProps> = ({
  data,
  onNodeClick,
  onEdgeClick,
  searchQuery,
  filters,
  className = ''
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<LayoutConfig['type']>('forceatlas2');
  const [showMinimap, setShowMinimap] = useState(true);
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [hoveredNode, setHoveredNode] = useState<Entity | null>(null);
  const [filteredData, setFilteredData] = useState<GraphData>(data);

  // Color palette for clusters
  const clusterColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];

  // Layout configurations
  const layoutConfigs: Record<LayoutConfig['type'], LayoutConfig> = {
    forceatlas2: {
      type: 'forceatlas2',
      iterations: 100,
      settings: {
        gravity: 1,
        strongGravity: false,
        scalingRatio: 10,
        slowDown: 1,
        edgeWeightInfluence: 1,
        adjustSizes: true,
        outboundAttractionDistribution: false,
        linLogMode: false,
        preventOverlap: true
      }
    },
    circular: {
      type: 'circular',
      iterations: 1,
      settings: {
        scale: 1,
        center: 0.5
      }
    },
    fruchterman: {
      type: 'fruchterman',
      iterations: 50,
      settings: {
        gravity: 1,
        speed: 1,
        temperature: 0.1,
        cooling: 0.95,
        maxIterations: 50
      }
    },
    noverlap: {
      type: 'noverlap',
      iterations: 10,
      settings: {
        margin: 10,
        expansion: 1.1,
        gridSize: 20,
        permittedExpansion: 1.1,
        speed: 3
      }
    }
  };

  // Detect semantic clusters based on embeddings
  const detectSemanticClusters = useCallback(async (entities: Entity[]): Promise<ClusterData[]> => {
    if (!entities.length) return [];

    try {
      // Group entities by type first
      const typeGroups = entities.reduce((acc, entity) => {
        const type = entity.type || 'unknown';
        if (!acc[type]) acc[type] = [];
        acc[type].push(entity);
        return acc;
      }, {} as Record<string, Entity[]>);

      // Create clusters based on entity types
      const clusters: ClusterData[] = Object.entries(typeGroups).map(([type, entities], index) => ({
        id: `cluster-${type}`,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        color: clusterColors[index % clusterColors.length],
        entities
      }));

      return clusters;
    } catch (error) {
      console.error('Error detecting clusters:', error);
      return [];
    }
  }, []);

  // Apply filters to data
  const applyFilters = useCallback((data: GraphData, filters: any): GraphData => {
    if (!filters) return data;

    const filteredEntities = data.entities.filter(entity => {
      if (filters.entityTypes && !filters.entityTypes.includes(entity.type)) return false;
      if (filters.pipelineStages && !filters.pipelineStages.includes(entity.pipeline_stage)) return false;
      if (filters.isInternal !== undefined && entity.is_internal !== filters.isInternal) return false;
      if (filters.isPortfolio !== undefined && entity.is_portfolio !== filters.isPortfolio) return false;
      if (filters.isPipeline !== undefined && entity.is_pipeline !== filters.isPipeline) return false;
      return true;
    });

    const entityIds = new Set(filteredEntities.map(e => e.id));
    const filteredEdges = data.edges.filter(edge => 
      entityIds.has(edge.source) && entityIds.has(edge.target)
    );

    return {
      entities: filteredEntities,
      edges: filteredEdges
    };
  }, []);

  // Calculate node size based on connections and importance
  const calculateNodeSize = useCallback((entity: Entity, allEdges: Edge[]): number => {
    const connectionCount = allEdges.filter(edge => 
      edge.source === entity.id || edge.target === entity.id
    ).length;
    
    const baseSize = 8;
    const connectionSize = Math.min(connectionCount * 0.5, 15);
    const importanceSize = (entity.importance || 0) * 5;
    
    return Math.max(baseSize, connectionSize + importanceSize);
  }, []);

  // Calculate edge styling based on strength
  const calculateEdgeStyle = useCallback((edge: Edge) => {
    const strength = edge.strength_score || 0.5;
    return {
      size: Math.max(1, strength * 5),
      opacity: 0.3 + (strength * 0.7),
      color: strength > 0.7 ? '#FF6B6B' : strength > 0.4 ? '#4ECDC4' : '#95A5A6'
    };
  }, []);

  // Find shortest path between two nodes
  const findShortestPath = useCallback((sourceId: string, targetId: string): string[] => {
    const visited = new Set<string>();
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: sourceId, path: [sourceId] }];
    
    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      
      if (nodeId === targetId) {
        return path;
      }
      
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      
      // Find connected nodes
      const connectedEdges = filteredData.edges.filter(edge => 
        edge.source === nodeId || edge.target === nodeId
      );
      
      for (const edge of connectedEdges) {
        const nextNodeId = edge.source === nodeId ? edge.target : edge.source;
        if (!visited.has(nextNodeId)) {
          queue.push({ nodeId: nextNodeId, path: [...path, nextNodeId] });
        }
      }
    }
    
    return [];
  }, [filteredData.edges]);

  // Initialize component
  useEffect(() => {
    const initializeComponent = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Apply filters
        const filtered = applyFilters(data, filters);
        setFilteredData(filtered);

        // Detect clusters
        const detectedClusters = await detectSemanticClusters(filtered.entities);
        setClusters(detectedClusters);

        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize graph');
        setIsLoading(false);
      }
    };

    initializeComponent();
  }, [data, filters, applyFilters, detectSemanticClusters]);

  // Handle node hover
  const handleNodeHover = useCallback((node: Entity | null) => {
    setHoveredNode(node);
    
    if (node && hoveredNode && node.id !== hoveredNode.id) {
      const path = findShortestPath(hoveredNode.id, node.id);
      setHighlightedPath(path);
    } else if (!node) {
      setHighlightedPath([]);
    }
  }, [hoveredNode, findShortestPath]);

  // Handle layout change
  const handleLayoutChange = useCallback((newLayout: LayoutConfig['type']) => {
    setSelectedLayout(newLayout);
  }, []);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading enhanced graph visualization...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-96 ${className}`}>
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold mb-2">Error loading graph</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Controls Panel */}
      <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Layout Algorithm
          </label>
          <select
            value={selectedLayout}
            onChange={(e) => handleLayoutChange(e.target.value as LayoutConfig['type'])}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="forceatlas2">ForceAtlas2</option>
            <option value="circular">Circular</option>
            <option value="fruchterman">Fruchterman-Reingold</option>
            <option value="noverlap">No Overlap</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="minimap"
            checked={showMinimap}
            onChange={(e) => setShowMinimap(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="minimap" className="text-sm text-gray-700">
            Show Minimap
          </label>
        </div>

        {clusters.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clusters ({clusters.length})
            </label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {clusters.map((cluster) => (
                <div key={cluster.id} className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cluster.color }}
                  />
                  <span className="text-xs text-gray-600">
                    {cluster.label} ({cluster.entities.length})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search Query Display */}
      {searchQuery && (
        <div className="absolute top-4 right-4 z-10 bg-blue-100 text-blue-800 px-3 py-2 rounded-lg shadow-sm">
          <span className="text-sm font-medium">Search: "{searchQuery}"</span>
        </div>
      )}

      {/* Hovered Node Info */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 z-10 bg-white rounded-lg shadow-lg p-4 max-w-sm">
          <h3 className="font-semibold text-gray-900 mb-2">{hoveredNode.name}</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">Type:</span> {hoveredNode.type}</p>
            {hoveredNode.domain && <p><span className="font-medium">Domain:</span> {hoveredNode.domain}</p>}
            {hoveredNode.industry && <p><span className="font-medium">Industry:</span> {hoveredNode.industry}</p>}
            {hoveredNode.importance && <p><span className="font-medium">Importance:</span> {hoveredNode.importance}</p>}
          </div>
        </div>
      )}

      {/* Main Graph Visualization */}
      <div className="w-full h-full">
        <EnhancedClientGraph
          data={filteredData}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onNodeHover={handleNodeHover}
          layout={layoutConfigs[selectedLayout]}
          clusters={clusters}
          highlightedPath={highlightedPath}
          showMinimap={showMinimap}
          calculateNodeSize={calculateNodeSize}
          calculateEdgeStyle={calculateEdgeStyle}
        />
      </div>
    </div>
  );
};

export default EnhancedGraphVisualization;