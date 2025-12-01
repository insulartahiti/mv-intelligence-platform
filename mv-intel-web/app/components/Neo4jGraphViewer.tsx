'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the heavy graph component with no SSR
const Neo4jVisNetwork = dynamic(
  () => import('./Neo4jVisNetwork'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p>Loading Graph Visualization...</p>
        </div>
      </div>
    )
  }
);

interface Neo4jGraphViewerProps {
  onNodeClick?: (nodeId: string, nodeData?: any) => void;
  onNodeHover?: (nodeId: string, nodeData?: any) => void;
  highlightedNodeIds?: string[];
  subgraphData?: any;
  hoveredNodeId?: string | null;
  limit?: number;
  minImportance?: number;
  className?: string;
}

export default function Neo4jGraphViewer({ 
  onNodeClick, 
  onNodeHover, 
  highlightedNodeIds, 
  subgraphData, 
  hoveredNodeId,
  limit,
  minImportance,
  className
}: Neo4jGraphViewerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className={`w-full h-full bg-slate-950 relative ${className || ''}`}>
      <Neo4jVisNetwork 
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        highlightedNodeIds={highlightedNodeIds}
        subgraphData={subgraphData}
        hoveredNodeId={hoveredNodeId}
        limit={limit}
        minImportance={minImportance}
        className={className}
      />
      
    </div>
  );
}
