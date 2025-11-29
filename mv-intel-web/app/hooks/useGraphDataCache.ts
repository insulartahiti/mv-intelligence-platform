'use client';

import { useState, useEffect, useCallback } from 'react';

interface GraphData {
  nodes: any[];
  edges: any[];
  timestamp: number;
}

interface CacheConfig {
  maxAge: number; // in milliseconds
  maxSize: number; // maximum number of cached items
}

class GraphDataCache {
  private cache = new Map<string, GraphData>();
  private config: CacheConfig;

  constructor(config: CacheConfig = { maxAge: 5 * 60 * 1000, maxSize: 10 }) {
    this.config = config;
  }

  set(key: string, data: GraphData): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      ...data,
      timestamp: Date.now()
    });
  }

  get(key: string): GraphData | null {
    const data = this.cache.get(key);
    if (!data) return null;

    // Check if data is expired
    if (Date.now() - data.timestamp > this.config.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global cache instance
const graphCache = new GraphDataCache();

export function useGraphDataCache() {
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0 });

  const getCachedData = useCallback((key: string): GraphData | null => {
    const data = graphCache.get(key);
    if (data) {
      setCacheStats(prev => ({ ...prev, hits: prev.hits + 1 }));
    } else {
      setCacheStats(prev => ({ ...prev, misses: prev.misses + 1 }));
    }
    return data;
  }, []);

  const setCachedData = useCallback((key: string, data: GraphData): void => {
    graphCache.set(key, data);
  }, []);

  const clearCache = useCallback((): void => {
    graphCache.clear();
    setCacheStats({ hits: 0, misses: 0 });
  }, []);

  return {
    getCachedData,
    setCachedData,
    clearCache,
    cacheStats,
    cacheSize: graphCache.size()
  };
}

// Hook for progressive data loading
export function useProgressiveGraphData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getCachedData, setCachedData } = useGraphDataCache();

  const loadGraphData = useCallback(async (
    params: { maxNodes?: number; maxEdges?: number; filters?: any } = {}
  ): Promise<GraphData | null> => {
    const cacheKey = `graph-${JSON.stringify(params)}`;
    
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    setLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams();
      if (params.maxNodes) searchParams.set('maxNodes', params.maxNodes.toString());
      if (params.maxEdges) searchParams.set('maxEdges', params.maxEdges.toString());

      const response = await fetch(`/api/graph/network?${searchParams}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch graph data: ${response.status}`);
      }

      const data = await response.json();
      const graphData: GraphData = {
        nodes: data.nodes || [],
        edges: data.edges || [],
        timestamp: Date.now()
      };

      // Cache the data
      setCachedData(cacheKey, graphData);

      return graphData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getCachedData, setCachedData]);

  return {
    loadGraphData,
    loading,
    error
  };
}
