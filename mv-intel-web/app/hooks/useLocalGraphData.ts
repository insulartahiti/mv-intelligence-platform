import { useState, useCallback, useEffect } from 'react';

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
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight: number;
}

interface LocalGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lastUpdated: number;
  version: string;
}

interface UseLocalGraphDataReturn {
  localData: LocalGraphData | null;
  isDownloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  downloadFullDataset: () => Promise<void>;
  isDataStale: boolean;
  lastUpdated: number | null;
}

const CACHE_KEY = 'mv-intel-graph-data';
const CACHE_TIMESTAMP_KEY = 'mv-intel-graph-data-timestamp';
const CACHE_VERSION = '2.0.0';
const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

export function useLocalGraphData(): UseLocalGraphDataReturn {
  const [localData, setLocalData] = useState<LocalGraphData | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Calculate if data is stale
  const isDataStale = localData ? 
    (Date.now() - localData.lastUpdated) > STALE_THRESHOLD : 
    true;

  const loadCachedData = useCallback(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.version === CACHE_VERSION) {
          setLocalData(data);
        }
      }
    } catch (error) {
      console.warn('Failed to load cached graph data:', error);
    }
  }, []);

  const downloadFullDataset = useCallback(async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress(0);

    try {
      // Download in chunks to avoid memory issues
      const chunkSize = 1000;
      let allNodes: GraphNode[] = [];
      let allEdges: GraphEdge[] = [];
      let offset = 0;
      let hasMore = true;

      console.log('Starting full dataset download...');

      // Download nodes in chunks
      while (hasMore) {
        setDownloadProgress(Math.min(50, (offset / 10000) * 50)); // First 50% for nodes
        
        const response = await fetch(
          `https://uqptiychukuwixubrbat.supabase.co/rest/v1/entities_view?select=*&limit=${chunkSize}&offset=${offset}`,
          {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch nodes: ${response.statusText}`);
        }

        const nodes = await response.json();
        if (nodes.length === 0) {
          hasMore = false;
        } else {
          allNodes = [...allNodes, ...nodes];
          offset += chunkSize;
        }

        // Prevent infinite loops
        if (offset > 50000) {
          console.warn('Reached maximum node limit, stopping download');
          break;
        }
      }

      console.log(`Downloaded ${allNodes.length} nodes, now downloading edges...`);

      // Download edges in chunks
      offset = 0;
      hasMore = true;
      while (hasMore) {
        setDownloadProgress(50 + Math.min(40, (offset / 20000) * 40)); // Next 40% for edges
        
        const response = await fetch(
          `https://uqptiychukuwixubrbat.supabase.co/rest/v1/edges_view?select=*&limit=${chunkSize}&offset=${offset}`,
          {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch edges: ${response.statusText}`);
        }

        const edges = await response.json();
        if (edges.length === 0) {
          hasMore = false;
        } else {
          allEdges = [...allEdges, ...edges];
          offset += chunkSize;
        }

        // Prevent infinite loops
        if (offset > 100000) {
          console.warn('Reached maximum edge limit, stopping download');
          break;
        }
      }

      console.log(`Downloaded ${allEdges.length} edges, processing data...`);

      // Process and format the data
      const processedNodes = allNodes.map(node => ({
        id: node.id,
        label: cleanPersonName(node.label, node.type),
        type: node.type === 'person' ? 'person' : 'company',
        domain: node.domain,
        industry: node.industry,
        pipeline_stage: node.pipeline_stage,
        fund: node.fund,
        taxonomy: node.taxonomy,
        is_internal: node.is_internal,
        is_portfolio: node.is_portfolio,
        is_pipeline: node.is_pipeline,
        importance: node.importance || 0,
        size: 6, // Will be calculated based on connections
        connection_count: 0 // Will be calculated
      }));

      // Calculate connection counts and node sizes
      const connectionCounts = new Map<string, number>();
      allEdges.forEach(edge => {
        connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
        connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
      });

      // Update nodes with connection counts and sizes
      processedNodes.forEach(node => {
        const count = connectionCounts.get(node.id) || 0;
        node.connection_count = count;
        node.size = Math.max(6, Math.min(20, 6 + Math.log(1 + count) * 3));
      });

      const processedEdges = allEdges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.kind || "relationship",
        weight: edge.weight || 0.5
      }));

      setDownloadProgress(95);

      // Cache the data
      const dataToCache: LocalGraphData = {
        nodes: processedNodes,
        edges: processedEdges,
        lastUpdated: Date.now(),
        version: CACHE_VERSION
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(dataToCache));
      setLocalData(dataToCache);
      setDownloadProgress(100);

      console.log(`Successfully downloaded and cached ${processedNodes.length} nodes and ${processedEdges.length} edges`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      setDownloadError(errorMessage);
      console.error('Failed to download full dataset:', error);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  // Load cached data on mount and set up auto-refresh
  useEffect(() => {
    loadCachedData();
    
    // Set up automatic refresh every hour
    const refreshInterval = setInterval(() => {
      const now = Date.now();
      const lastUpdated = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      if (lastUpdated) {
        const dataAge = now - new Date(lastUpdated).getTime();
        const isStale = dataAge > STALE_THRESHOLD;
        
        if (localData && isStale) {
          console.log('Auto-refreshing stale local data...');
          downloadFullDataset();
        }
      }
    }, 60 * 60 * 1000); // 1 hour

    return () => clearInterval(refreshInterval);
  }, [loadCachedData, downloadFullDataset]); // Removed localData and isDataStale from dependencies

  const cleanPersonName = (name: string, type: string) => {
    if (type === 'person' && name.includes(';')) {
      return name.split(';')[0].trim();
    }
    return name;
  };

  return {
    localData,
    isDownloading,
    downloadProgress,
    downloadError,
    downloadFullDataset,
    isDataStale,
    lastUpdated: localData?.lastUpdated || null
  };
}
