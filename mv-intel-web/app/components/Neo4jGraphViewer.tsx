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
      
      {/* Legend / Controls Overlay */}
      <div className="absolute bottom-6 left-6 pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur border border-slate-800 p-4 rounded-xl shadow-xl pointer-events-auto">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Graph Legend</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#7c3aed]"></span>
              <span className="text-slate-300">Organization</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#2563eb]"></span>
              <span className="text-slate-300">Person</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#dc2626]"></span>
              <span className="text-slate-300">Internal Team</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
