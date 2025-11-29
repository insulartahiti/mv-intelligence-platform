'use client';

import { useState, useCallback } from 'react';
import Neo4jVisNetwork from '../components/Neo4jVisNetwork';

export default function Neo4jTestPage() {
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);

  const handleNodeClick = useCallback((nodeId: string, nodeData: any) => {
    console.log('Node clicked:', nodeId, nodeData);
    setSelectedNode({ id: nodeId, ...nodeData });
  }, []);

  const handleNodeHover = useCallback((nodeId: string, nodeData: any) => {
    setHoveredNode({ id: nodeId, ...nodeData });
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🕸️ Neo4j Graph Visualization
          </h1>
          <p className="text-gray-600">
            Interactive graph visualization powered by Neo4j and Neovis.js
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Graph */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Knowledge Graph</h2>
              <Neo4jVisNetwork
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                className="h-[600px]"
                limit={100}
                minImportance={0.5}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Selected Node */}
            {selectedNode && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-3 text-blue-600">
                  Selected Node
                </h3>
                <div className="space-y-2 text-sm">
                  <div><strong>ID:</strong> {selectedNode.id}</div>
                  <div><strong>Name:</strong> {selectedNode.name || 'N/A'}</div>
                  <div><strong>Type:</strong> {selectedNode.type || 'N/A'}</div>
                  <div><strong>Importance:</strong> {selectedNode.importance || 'N/A'}</div>
                  <div><strong>Internal:</strong> {selectedNode.is_internal ? 'Yes' : 'No'}</div>
                  {selectedNode.industry && (
                    <div><strong>Industry:</strong> {selectedNode.industry}</div>
                  )}
                  {selectedNode.domain && (
                    <div><strong>Domain:</strong> {selectedNode.domain}</div>
                  )}
                  {selectedNode.linkedin_url && (
                    <div>
                      <strong>LinkedIn:</strong> 
                      <a href={selectedNode.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                        View Profile
                      </a>
                    </div>
                  )}
                  {selectedNode.enrichment_data && (
                    <div className="mt-3">
                      <strong>Enrichment Data:</strong>
                      <div className="mt-1 p-2 bg-gray-50 rounded text-xs max-h-32 overflow-y-auto">
                        {(() => {
                          try {
                            const enrichment = JSON.parse(selectedNode.enrichment_data);
                            if (enrichment.web_search_data) {
                              const searchData = JSON.parse(enrichment.web_search_data);
                              return (
                                <div>
                                  <div><strong>Search Results:</strong> {searchData.results?.length || 0}</div>
                                  {searchData.results?.slice(0, 2).map((result: any, idx: number) => (
                                    <div key={idx} className="mt-1">
                                      <div className="font-medium">{result.title}</div>
                                      <div className="text-gray-600">{result.snippet?.substring(0, 100)}...</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return <div>No web search data available</div>;
                          } catch (e) {
                            return <div>Error parsing enrichment data</div>;
                          }
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hovered Node */}
            {hoveredNode && !selectedNode && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-3 text-green-600">
                  Hovered Node
                </h3>
                <div className="space-y-2 text-sm">
                  <div><strong>Name:</strong> {hoveredNode.name || 'N/A'}</div>
                  <div><strong>Type:</strong> {hoveredNode.type || 'N/A'}</div>
                  <div><strong>Importance:</strong> {hoveredNode.importance || 'N/A'}</div>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3 text-blue-800">
                How to Use
              </h3>
              <ul className="space-y-2 text-sm text-blue-700">
                <li>• <strong>Click</strong> nodes to select them</li>
                <li>• <strong>Hover</strong> over nodes for quick info</li>
                <li>• <strong>Drag</strong> to pan around the graph</li>
                <li>• <strong>Scroll</strong> to zoom in/out</li>
                <li>• <strong>Double-click</strong> nodes to center them</li>
              </ul>
            </div>

            {/* Performance Info */}
            <div className="bg-green-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3 text-green-800">
                Performance Benefits
              </h3>
              <ul className="space-y-2 text-sm text-green-700">
                <li>• <strong>Native Neo4j</strong> - Direct database connection</li>
                <li>• <strong>Optimized queries</strong> - Only loads what's needed</li>
                <li>• <strong>Hardware acceleration</strong> - Uses WebGL rendering</li>
                <li>• <strong>Real-time updates</strong> - Live data from Neo4j</li>
                <li>• <strong>Scalable</strong> - Handles 100K+ nodes efficiently</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
