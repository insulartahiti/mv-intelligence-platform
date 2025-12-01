'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GraphData, Entity, Edge } from '../../lib/types';

// Dynamic import to avoid SSR issues
const EnhancedGraphVisualization = dynamic(
  () => import('../components/EnhancedGraphVisualization'),
  { ssr: false }
);

const EnhancedGraphTestPage: React.FC = () => {
  const [graphData, setGraphData] = useState<GraphData>({ entities: [], edges: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    entityTypes: [] as string[],
    pipelineStages: [] as string[],
    isInternal: undefined as boolean | undefined,
    isPortfolio: undefined as boolean | undefined,
    isPipeline: undefined as boolean | undefined,
  });
  const [selectedNode, setSelectedNode] = useState<Entity | null>(null);

  // Load graph data
  useEffect(() => {
    const loadGraphData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/graph/data');
        if (!response.ok) {
          throw new Error(`Failed to load graph data: ${response.statusText}`);
        }

        const data = await response.json();
        setGraphData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load graph data');
      } finally {
        setIsLoading(false);
      }
    };

    loadGraphData();
  }, []);

  // Handle node click
  const handleNodeClick = (node: Entity) => {
    setSelectedNode(node);
    console.log('Node clicked:', node);
  };

  // Handle edge click
  const handleEdgeClick = (edge: Edge) => {
    console.log('Edge clicked:', edge);
  };

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Handle filter changes
  const handleFilterChange = (filterType: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading enhanced graph visualization...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold mb-2">Error loading graph</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Enhanced Knowledge Graph Visualization
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Advanced graph visualization with semantic clustering and interactive features
              </p>
            </div>
            
            {/* Search */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search entities..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center space-x-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity Types
              </label>
              <select
                multiple
                value={filters.entityTypes}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value);
                  handleFilterChange('entityTypes', values);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="person">Person</option>
                <option value="organization">Organization</option>
                <option value="company">Company</option>
                <option value="fund">Fund</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pipeline Stage
              </label>
              <select
                multiple
                value={filters.pipelineStages}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value);
                  handleFilterChange('pipelineStages', values);
                }}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="prospect">Prospect</option>
                <option value="qualified">Qualified</option>
                <option value="proposal">Proposal</option>
                <option value="negotiation">Negotiation</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.isInternal || false}
                  onChange={(e) => handleFilterChange('isInternal', e.target.checked || undefined)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Internal</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.isPortfolio || false}
                  onChange={(e) => handleFilterChange('isPortfolio', e.target.checked || undefined)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Portfolio</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.isPipeline || false}
                  onChange={(e) => handleFilterChange('isPipeline', e.target.checked || undefined)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Pipeline</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-200px)]">
        {/* Graph Visualization */}
        <div className="flex-1 relative">
          <EnhancedGraphVisualization
            data={graphData}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            searchQuery={searchQuery}
            filters={filters}
            className="w-full h-full"
          />
        </div>

        {/* Sidebar */}
        {selectedNode && (
          <div className="w-80 bg-white border-l shadow-lg overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Node Details
                </h3>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900">{selectedNode.name}</h4>
                  <p className="text-sm text-gray-600">{selectedNode.type}</p>
                </div>

                {selectedNode.domain && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Domain:</span>
                    <p className="text-sm text-gray-600">{selectedNode.domain}</p>
                  </div>
                )}

                {selectedNode.industry && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Industry:</span>
                    <p className="text-sm text-gray-600">{selectedNode.industry}</p>
                  </div>
                )}

                {selectedNode.pipeline_stage && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Pipeline Stage:</span>
                    <p className="text-sm text-gray-600">{selectedNode.pipeline_stage}</p>
                  </div>
                )}

                {selectedNode.importance && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Importance:</span>
                    <p className="text-sm text-gray-600">{selectedNode.importance}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {selectedNode.is_internal && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                      Internal
                    </span>
                  )}
                  {selectedNode.is_portfolio && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      Portfolio
                    </span>
                  )}
                  {selectedNode.is_pipeline && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      Pipeline
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center space-x-6">
              <span>Entities: {graphData.entities.length}</span>
              <span>Edges: {graphData.edges.length}</span>
              <span>Clusters: {filters.entityTypes.length || 'All'}</span>
            </div>
            <div>
              Enhanced Knowledge Graph Intelligence System
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedGraphTestPage;
