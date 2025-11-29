'use client';

import { useState, useEffect, useCallback } from 'react';
import Neo4jGraphViewer from '../components/Neo4jGraphViewer';
import NodeDetailPanel from '../components/NodeDetailPanel';
import GraphSearchPanel from '../components/GraphSearchPanel';
// Neo4jVisNetwork handles data loading internally

// GraphNode type for the network graph visualization
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
};

// Network Graph types
type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight?: number;
};

type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type NodeDetails = {
  id: string;
  name: string;
  type: string;
  files: Array<{ id: number; name: string; size: number; created_at: string; download_url: string }>;
  latest_summary: string;
};

export default function KnowledgeGraphPage() {
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Removed old loading progress and Neo4j test state - now handled by hooks

  // Neo4jVisNetwork handles all data loading internally

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchInsight, setSearchInsight] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchFilters, setSearchFilters] = useState<any>({
    entityTypes: [],
    pipelineStages: [],
    funds: [],
    industries: [],
    showInternalOnly: false,
    showLinkedInOnly: false,
    minStrengthScore: 0
  });

  // Node detail state
  const [showNodeDetails, setShowNodeDetails] = useState(false);

  // Network Graph state
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<NodeDetails | null>(null);

  // Load graph data on component mount - prioritize full dataset
  // Neo4jVisNetwork handles data loading automatically

  // Removed old Neo4j test functions - now handled by hooks

  const handleSearch = async (query: string, filters: any) => {
    setSearchLoading(true);
    setSearchError(null);
    setSearchInsight(null);
    setSearchQuery(query);
    setSearchFilters(filters);

    try {
      const response = await fetch('/api/universal-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, filters, limit: 50 })
      });

      const data = await response.json();

      if (data.success) {
        if (data.intent === 'MARKET_INSIGHT' && data.data?.answer) {
             setSearchInsight(data.data.answer);
             setSearchResults(data.results || []); // Show context results if available
        } else if (data.intent === 'RELATIONSHIP_QUERY' && data.data) {
           // Map Cypher results to SearchResult format
           // Expected data.data is an array of objects with node/rel properties
           const mappedResults: any[] = [];
           const seenIds = new Set();

           data.data.forEach((row: any) => {
             // Iterate through all keys in the row to find nodes
             Object.values(row).forEach((val: any) => {
                if (val && val.id && val.name && !seenIds.has(val.id)) {
                   // Check if it looks like an entity node
                   // In our Cypher generator, we request 'type' property
                   seenIds.add(val.id);
                   mappedResults.push({
                     id: val.id,
                     name: val.name,
                     type: val.type || (val.label === 'Person' ? 'person' : 'organization'),
                     similarity: 1, // Artificial score for exact graph matches
                     domain: val.domain,
                     // Add a badge to indicate it came from a graph query
                     metadata: {
                       taxonomy: 'Graph Match' 
                     }
                   });
                }
             });
           });
           setSearchResults(mappedResults);
        } else {
           // Standard Entity Search results
           setSearchResults(data.results || []);
        }
        setSearchError(null);
      } else {
        setSearchError(data.message || 'Search failed');
        setSearchResults([]);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleFilterChange = (filters: any) => {
    setSearchFilters(filters);
    // Neo4jVisNetwork handles filtering internally
  };

  const handleNodeClick = useCallback(async (nodeId: string, nodeData?: any) => {
    console.log('Knowledge Graph: Node clicked:', nodeId, nodeData);
    console.log('Knowledge Graph: Setting showNodeDetails to true');
    setSelectedNodeId(nodeId);
    setShowNodeDetails(true);

    // Also fetch the node details to populate the panel
    try {
      console.log('Knowledge Graph: Fetching node details for:', nodeId);
      const res = await fetch(`/api/neo4j/node-details?id=${encodeURIComponent(nodeId)}`);
      if (res.ok) {
        const details = await res.json();
        console.log('Knowledge Graph: Node details response:', details);
        if (details.success && details.data) {
          setSelectedNodeDetails(details.data.node as NodeDetails);
          console.log('Knowledge Graph: Node details set:', details.data.node);
        }
      }
    } catch (err) {
      console.error('Error fetching node details:', err);
    }

    // Neo4jVisNetwork handles node expansion internally
  }, []);

  const handleNodeHover = useCallback((nodeId: string, nodeData: any) => {
    // Optional: Add hover effects or preview functionality
    console.log('Hovering over node:', nodeId, nodeData);
  }, []);

  const handleCloseNodeDetails = () => {
    setShowNodeDetails(false);
    setSelectedNodeId(null);
  };

  // Neo4jVisNetwork handles all data loading automatically

  // Fetch node details for the right drawer
  const fetchNodeDetails = async (nodeId: string) => {
    try {
      const res = await fetch(`/api/neo4j/node-details?id=${encodeURIComponent(nodeId)}`);
      if (!res.ok) throw new Error(`Details fetch failed: ${res.statusText}`);
      const details = await res.json();
      if (details.success && details.data) {
        setSelectedNodeDetails(details.data.node as NodeDetails);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch node details');
    }
  };

  return (
    <div className="h-screen bg-slate-950 flex flex-col">
      {/* Header - Fixed height */}
      <div className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">🕸️ Relationship Network</h1>
            <p className="text-sm text-slate-400">People, organizations, and their relationships from your investment pipeline.</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#3b82f6' }}></span><span>Person</span></div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#94a3b8' }}></span><span>Organization</span></div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#8b5cf6' }}></span><span>LinkedIn 1st°</span></div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#10b981' }}></span><span>Portfolio</span></div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#f59e0b' }}></span><span>Qualified</span></div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#60a5fa' }}></span><span>Investigate</span></div>
              <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#ef4444' }}></span><span>Internal Owner</span></div>
            </div>
          </div>
          <div className="text-sm text-slate-500">
            Neo4j Graph Visualization - All data loaded automatically
          </div>
        </div>
      </div>

      {/* Search Panel - Fixed height */}
      <div className="bg-slate-900/30 border-b border-slate-800 px-6 py-3 relative z-50">
        <GraphSearchPanel
          onSearch={handleSearch}
          onClear={() => {
            setSearchQuery('')
            setSearchResults([])
            setSearchInsight(null)
            setSearchError(null)
          }}
          searchResults={searchResults}
          isLoading={searchLoading}
          aiInsight={searchInsight}
          onResultClick={(result) => handleNodeClick(result.id, result)}
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 px-6 py-3">
          <h3 className="text-red-400 font-medium">Error</h3>
          <p className="text-red-300 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Graph Visualization - Takes remaining space */}
      <div className="flex-1 bg-slate-950 relative" style={{ minHeight: '600px' }}>
        <Neo4jGraphViewer
          key="neo4j-graph-viewer"
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          initialLimit={30000}
          minImportance={0}
          className="w-full h-full"
        />

        {/* Node Detail Panel */}
        {showNodeDetails && selectedNodeId && (
          <NodeDetailPanel
            nodeId={selectedNodeId}
            onClose={handleCloseNodeDetails}
            onSelectNode={(id) => handleNodeClick(id)}
          />
        )}
      </div>
    </div>
  );
}