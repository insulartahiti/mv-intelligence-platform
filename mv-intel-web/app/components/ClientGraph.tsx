'use client';

import { useEffect, useState, useRef } from 'react';
import Graph from 'graphology';
import { SigmaContainer, ControlsContainer, ZoomControl, FullScreenControl, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import { LayoutForceAtlas2Control } from '@react-sigma/layout-forceatlas2';
import { GraphSearch } from '@react-sigma/graph-search';

type GraphPayload = {
  nodes: Array<{
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
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    kind: string;
    weight?: number;
  }>;
};

// Custom component to handle trackpad gestures
function TrackpadGestures() {
  const sigma = useSigma();
  const containerRef = useRef<HTMLDivElement>(null);

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
        // Two-finger scroll (pan)
        const camera = sigma.getCamera();
        const deltaX = e.deltaX;
        const deltaY = e.deltaY;
        
        camera.animate({
          x: camera.x - deltaX,
          y: camera.y - deltaY,
        }, { duration: 100 });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [sigma]);

  return <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }} />;
}

function SigmaGraph({ data, onNodeClick }: { data: GraphPayload; onNodeClick: (nodeId: string) => void }) {
  const loadGraph = useLoadGraph();
  const register = useRegisterEvents();

  useEffect(() => {
    console.log('SigmaGraph: Loading data with', data.nodes.length, 'nodes and', data.edges.length, 'edges');
    
    const g = new Graph({ allowSelfLoops: false, multi: true });
    
    // Calculate better node sizes based on connections
    const nodeConnections = new Map<string, number>();
    for (const e of data.edges) {
      nodeConnections.set(e.source, (nodeConnections.get(e.source) || 0) + 1);
      nodeConnections.set(e.target, (nodeConnections.get(e.target) || 0) + 1);
    }
    
    // Nodes with better positioning and sizing
    const nodeCount = data.nodes.length;
    for (let i = 0; i < data.nodes.length; i++) {
      const n = data.nodes[i];
      const connections = nodeConnections.get(n.id) || 0;
      
      // Circular layout for better initial positioning
      const angle = (2 * Math.PI * i) / nodeCount;
      const radius = Math.min(200, Math.max(100, nodeCount * 2));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      // Better node sizing based on connections
      const baseSize = 12;
      const connectionSize = Math.min(8, connections * 2);
      const finalSize = Math.max(baseSize, baseSize + connectionSize);
      
      g.addNode(n.id, {
        label: n.label,
        size: finalSize,
        color: n.internal_owner ? '#dc2626' : (n.type === 'person' ? '#2563eb' : '#059669'),
        industry: n.industry,
        title: n.title,
        domain: n.domain,
        linkedin_first_degree: n.linkedin_first_degree,
        affinity_strength: n.affinity_strength ?? null,
        x: x,
        y: y,
      });
    }
    
    // Edges with better visibility
    for (const e of data.edges) {
      const key = e.id || `${e.source}->${e.target}-${e.kind}`;
      g.addEdge(e.source, e.target, {
        key,
        label: e.kind,
        size: Math.max(1, Math.min(4, (e.weight ?? 1) * 3)),
        color: e.kind === 'affinity' ? '#059669' : '#6b7280',
      });
    }
    
    console.log('SigmaGraph: Graph created with', g.order, 'nodes and', g.size, 'edges');
    loadGraph(g);
    
    // Register click events
    register({
      clickNode: (event) => {
        onNodeClick(event.node);
      },
    });

    // Cleanup function to prevent WebGL context accumulation
    return () => {
      // Clear the graph to free up resources
      g.clear();
    };
  }, [loadGraph, register, data, onNodeClick]);

  return null;
}

export default function ClientGraph({ 
  data, 
  onNodeClick 
}: { 
  data: GraphPayload; 
  onNodeClick: (nodeId: string) => void;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center">
        <div className="text-gray-500">Loading graph...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px]">
      <SigmaContainer
        style={{ height: '100%', width: '100%', minHeight: '400px' }}
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
        <SigmaGraph key={`graph-${data.nodes.length}-${data.edges.length}`} data={data} onNodeClick={onNodeClick} />
        <TrackpadGestures />
        <ControlsContainer position="top-right">
          <ZoomControl />
          <FullScreenControl />
          <LayoutForceAtlas2Control />
        </ControlsContainer>
        <ControlsContainer position="top-left">
          <GraphSearch onChange={() => {}} />
        </ControlsContainer>
      </SigmaContainer>
    </div>
  );
}
