'use client';

import React, { useState, useEffect } from 'react';

interface SystemStatus {
  totalEntities: number;
  entitiesWithEmbeddings: number;
  embeddingCoverage: number;
  entitiesWithEnhancement: number;
  enhancementCoverage: number;
  // New hybrid enhancement metrics
  entitiesWithHybridEnhancement: number;
  hybridEnhancementCoverage: number;
  entitiesWithAISummary: number;
  aiSummaryCoverage: number;
  entitiesWithTaxonomy: number;
  taxonomyCoverage: number;
  totalEdges: number;
  linkedinConnections: number;
  // Affinity metrics
  affinityEntities: number;
  affinityPersons: number;
  affinityCoverage: number;
  totalInteractions: number;
  lastSyncTimestamp: string | null;
  lastSyncEntitiesSynced: number;
  rateLimitRemaining: number;
  syncStatus: string;
  lastUpdated: string;
}

export default function DashboardPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/graph/system-status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
      }
    } catch (error) {
      console.error('Error fetching system status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading system status...</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-600">
          <p>Failed to load system status</p>
          <button 
            onClick={fetchStatus}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
          <p className="mt-2 text-gray-600">Real-time intelligence platform metrics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-bold">E</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Entities</p>
                <p className="text-2xl font-semibold text-gray-900">{status.totalEntities.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-bold">AI</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">AI Embeddings</p>
                <p className="text-2xl font-semibold text-gray-900">{status.embeddingCoverage.toFixed(1)}%</p>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(status.embeddingCoverage, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{status.entitiesWithEmbeddings.toLocaleString()} entities</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-bold">H</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Hybrid Enhancement</p>
                <p className="text-2xl font-semibold text-gray-900">{status.hybridEnhancementCoverage.toFixed(1)}%</p>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(status.hybridEnhancementCoverage, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{status.entitiesWithHybridEnhancement.toLocaleString()} enhanced</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-bold">T</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Enhanced</p>
                <p className="text-2xl font-semibold text-gray-900">{status.enhancementCoverage.toFixed(1)}%</p>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(status.enhancementCoverage, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{status.entitiesWithEnhancement.toLocaleString()} enhanced</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Embedding Progress</h2>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Entities with AI embeddings</span>
                <span>{status.entitiesWithEmbeddings.toLocaleString()} / {status.totalEntities.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className="bg-green-500 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(status.embeddingCoverage, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Hybrid Enhancement (GPT-4o + Perplexity)</h2>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Entities with hybrid enhancement</span>
                <span>{status.entitiesWithHybridEnhancement.toLocaleString()} / {status.totalEntities.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className="bg-purple-500 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(status.hybridEnhancementCoverage, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <div className="text-xs text-gray-600 mt-2">
                <p>• GPT-4o analysis + taxonomy classification</p>
                <p>• Real-time web research via Perplexity</p>
                <p>• Enhanced business context & insights</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Total Enhancement Progress</h2>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Entities with AI summary + taxonomy</span>
                <span>{status.entitiesWithEnhancement.toLocaleString()} / {status.totalEntities.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className="bg-orange-500 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(status.enhancementCoverage, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <div className="text-xs text-gray-600 mt-2">
                <p>• AI Summary: {status.aiSummaryCoverage.toFixed(1)}% ({status.entitiesWithAISummary.toLocaleString()})</p>
                <p>• Taxonomy: {status.taxonomyCoverage.toFixed(1)}% ({status.entitiesWithTaxonomy.toLocaleString()})</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Network Statistics</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Edges</span>
                <span className="font-semibold">{status.totalEdges.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">LinkedIn Connections</span>
                <span className="font-semibold">{status.linkedinConnections.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Affinity Entities</span>
                <span className="font-semibold">{status.affinityEntities.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Affinity Persons</span>
                <span className="font-semibold">{status.affinityPersons.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Interactions</span>
                <span className="font-semibold">{status.totalInteractions.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">System Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Sync Status</span>
                <span className={`font-semibold ${status.syncStatus === 'idle' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {status.syncStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Rate Limit Remaining</span>
                <span className="font-semibold">{status.rateLimitRemaining}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Sync</span>
                <span className="font-semibold text-sm">
                  {status.lastSyncTimestamp ? new Date(status.lastSyncTimestamp).toLocaleDateString() : 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Updated</span>
                <span className="font-semibold text-sm">
                  {new Date(status.lastUpdated).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button 
            onClick={fetchStatus}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Refresh Status
          </button>
        </div>
      </div>
    </div>
  );
}
