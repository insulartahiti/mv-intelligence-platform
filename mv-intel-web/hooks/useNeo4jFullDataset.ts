'use client';

import { useState, useCallback, useEffect } from 'react';

const FULL_DATASET_KEY = 'mv-intel-neo4j-full-dataset';
const FULL_DATASET_TIMESTAMP_KEY = 'mv-intel-neo4j-full-dataset-timestamp';
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

interface GraphNode {
  id: string;
  label: string;
  type: string;
  domain?: string;
  industry?: string;
  pipeline_stage?: string;
  fund?: string;
  taxonomy?: string;
  is_internal?: boolean;
  is_portfolio?: boolean;
  is_pipeline?: boolean;
  importance?: number;
  size: number;
  connection_count: number;
  color?: string;
  title?: string;
  linkedin_first_degree?: boolean;
  affinity_strength?: number;
  [key: string]: any;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight: number;
  strength_score?: number;
  [key: string]: any;
}

interface FullDataset {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  totalEdges: number;
  lastUpdated: string;
  version: string;
}

interface UseNeo4jFullDatasetReturn {
  fullDataset: FullDataset | null;
  loading: boolean;
  error: string | null;
  loadFullDataset: () => Promise<void>;
  isStale: boolean;
  lastUpdated: string | null;
  clearCache: () => void;
}

// IndexedDB fallback for large datasets
const DB_NAME = 'MVIntelligenceNeo4jDB';
const DB_VERSION = 1;
const STORE_NAME = 'neo4jFullDataset';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

const saveToIndexedDB = async (dataset: FullDataset): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const request = store.put(dataset, 'dataset');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const loadFromIndexedDB = async (): Promise<FullDataset | null> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get('dataset');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('IndexedDB not available:', error);
    return null;
  }
};

const processNode = (node: any): GraphNode => ({
  id: node.id.toString(),
  label: node.label || node.name,
  type: node.type || 'Entity',
  domain: node.properties?.domain,
  industry: node.properties?.industry,
  pipeline_stage: node.properties?.pipeline_stage,
  fund: node.properties?.fund,
  taxonomy: node.properties?.taxonomy,
  is_internal: node.properties?.is_internal || false,
  is_portfolio: node.properties?.is_portfolio || false,
  is_pipeline: node.properties?.is_pipeline || false,
  importance: node.properties?.importance || 0,
  size: Math.max(6, Math.min(20, 6 + Math.log(1 + (node.properties?.connection_count || 0)) * 3)),
  connection_count: node.properties?.connection_count || 0,
  color: getNodeColor(node),
  title: generateTooltip(node),
  linkedin_first_degree: node.properties?.linkedin_first_degree || false,
  affinity_strength: node.properties?.affinity_strength || 0,
  ...node.properties
});

const processEdge = (edge: any): GraphEdge => ({
  id: edge.id.toString(),
  source: edge.from || edge.source,
  target: edge.to || edge.target,
  kind: edge.label || edge.kind || 'RELATES',
  weight: edge.properties?.weight || edge.weight || 0.5,
  strength_score: edge.properties?.strength_score || edge.strength_score || 0.5,
  ...edge.properties
});

const getNodeColor = (node: any) => {
  const props = node.properties;
  if (props?.is_internal) return '#dc2626';
  if (props?.is_portfolio) return '#059669';
  if (props?.is_pipeline) return '#3b82f6';
  if (props?.type === 'person') return '#2563eb';
  if (props?.pipeline_stage === 'Qualified') return '#f59e0b';
  if (props?.pipeline_stage === 'Investigate') return '#3b82f6';
  return '#6b7280';
};

const generateTooltip = (node: any) => {
  const props = node.properties;
  let tooltip = `<strong>${props?.name || node.label}</strong><br/>Type: ${props?.type || 'Entity'}`;
  if (props?.industry) tooltip += `<br/>Industry: ${props.industry}`;
  if (props?.pipeline_stage) tooltip += `<br/>Stage: ${props.pipeline_stage}`;
  if (props?.importance) tooltip += `<br/>Importance: ${props.importance.toFixed(2)}`;
  if (props?.is_internal) tooltip += `<br/>🏢 Internal Owner`;
  if (props?.is_portfolio) tooltip += `<br/>💼 Portfolio Company`;
  if (props?.is_pipeline) tooltip += `<br/>📈 Pipeline Company`;
  return tooltip;
};

export function useNeo4jFullDataset(): UseNeo4jFullDatasetReturn {
  const [fullDataset, setFullDataset] = useState<FullDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const isStale = useCallback(() => {
    if (!lastUpdated) return true;
    const lastUpdateTime = new Date(lastUpdated).getTime();
    const now = Date.now();
    return (now - lastUpdateTime) > STALE_THRESHOLD_MS;
  }, [lastUpdated]);

  const loadFullDataset = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to load from cache first
      const cachedData = localStorage.getItem(FULL_DATASET_KEY);
      const cachedTimestamp = localStorage.getItem(FULL_DATASET_TIMESTAMP_KEY);
      
      if (cachedData && cachedTimestamp && !isStale()) {
        const dataset = JSON.parse(cachedData);
        setFullDataset(dataset);
        setLastUpdated(cachedTimestamp);
        setLoading(false);
        return;
      }

      // Try IndexedDB as fallback
      const indexedData = await loadFromIndexedDB();
      if (indexedData && !isStale()) {
        setFullDataset(indexedData);
        setLastUpdated(indexedData.lastUpdated);
        setLoading(false);
        return;
      }

      // Fetch fresh data from Neo4j
      const response = await fetch('/api/neo4j/graph-data?limit=10000&includeAll=true');
      const result = await response.json();

      if (result.success) {
        const processedNodes = result.data.nodes.map(processNode);
        const processedEdges = result.data.edges.map(processEdge);
        
        const dataset: FullDataset = {
          nodes: processedNodes,
          edges: processedEdges,
          totalNodes: result.meta?.totalNodes || processedNodes.length,
          totalEdges: result.meta?.totalEdges || processedEdges.length,
          lastUpdated: new Date().toISOString(),
          version: '2.0'
        };

        setFullDataset(dataset);
        setLastUpdated(dataset.lastUpdated);

        // Cache the data
        try {
          localStorage.setItem(FULL_DATASET_KEY, JSON.stringify(dataset));
          localStorage.setItem(FULL_DATASET_TIMESTAMP_KEY, dataset.lastUpdated);
          
          // Also save to IndexedDB for large datasets
          await saveToIndexedDB(dataset);
        } catch (cacheError) {
          console.warn('Failed to cache dataset:', cacheError);
        }
      } else {
        setError(result.message || 'Failed to load full dataset');
      }
    } catch (err: any) {
      console.error('Error loading full dataset:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [isStale]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(FULL_DATASET_KEY);
    localStorage.removeItem(FULL_DATASET_TIMESTAMP_KEY);
    setFullDataset(null);
    setLastUpdated(null);
  }, []);

  // Auto-load on mount if no cached data
  useEffect(() => {
    if (!fullDataset && !loading) {
      loadFullDataset();
    }
  }, [fullDataset, loading, loadFullDataset]);

  return {
    fullDataset,
    loading,
    error,
    loadFullDataset,
    isStale: isStale(),
    lastUpdated,
    clearCache
  };
}
