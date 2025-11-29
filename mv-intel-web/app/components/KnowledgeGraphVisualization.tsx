'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

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

// Dynamically import the graph component to avoid SSR issues
const ClientGraph = dynamic(() => import('./ClientGraph'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-gray-500">Loading graph...</div>
    </div>
  ),
});

export default function KnowledgeGraphVisualization({ 
  data, 
  onNodeClick 
}: { 
  data: GraphPayload; 
  onNodeClick: (nodeId: string) => void;
}) {
  const [isClient, setIsClient] = useState(false);

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-gray-500">Loading graph...</div>
      </div>
    );
  }

  return <ClientGraph data={data} onNodeClick={onNodeClick} />;
}
