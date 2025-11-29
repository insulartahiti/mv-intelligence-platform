import { useState, useCallback, useEffect } from 'react';

const FULL_DATASET_KEY = 'mv-intel-full-dataset';
const FULL_DATASET_TIMESTAMP_KEY = 'mv-intel-full-dataset-timestamp';
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours (reduced for more frequent updates)

// IndexedDB fallback for large datasets
const DB_NAME = 'MVIntelligenceDB';
const DB_VERSION = 1;
const STORE_NAME = 'fullDataset';

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

interface FullDataset {
  entities: any[];
  edges: any[];
  lastUpdated: number;
  version: string;
}

interface UseFullDatasetReturn {
  fullDataset: FullDataset | null;
  isDownloading: boolean;
  downloadProgress: number;
  downloadError: string | null;
  isDataStale: boolean;
  lastUpdated: string | null;
  downloadFullDataset: () => Promise<void>;
  clearDataset: () => void;
  stats: {
    entitiesCount: number;
    edgesCount: number;
    totalSize: number;
  } | null;
}

export function useFullDataset(): UseFullDatasetReturn {
  const [fullDataset, setFullDataset] = useState<FullDataset | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDataStale, setIsDataStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stats, setStats] = useState<{ entitiesCount: number; edgesCount: number; totalSize: number } | null>(null);

  const loadCachedData = useCallback(async () => {
    try {
      // Try localStorage first
      const storedData = localStorage.getItem(FULL_DATASET_KEY);
      const storedTimestamp = localStorage.getItem(FULL_DATASET_TIMESTAMP_KEY);

      if (storedData && storedTimestamp) {
        const parsedData: FullDataset = JSON.parse(storedData);
        setFullDataset(parsedData);
        setLastUpdated(storedTimestamp);

        const now = Date.now();
        const dataAge = now - new Date(storedTimestamp).getTime();
        setIsDataStale(dataAge > STALE_THRESHOLD_MS);

        // Calculate stats
        const totalSize = JSON.stringify(parsedData).length;
        setStats({
          entitiesCount: parsedData.entities.length,
          edgesCount: parsedData.edges.length,
          totalSize: totalSize
        });
      } else {
        // Fallback to IndexedDB
        const indexedData = await loadFromIndexedDB();
        if (indexedData) {
          setFullDataset(indexedData);
          setLastUpdated(new Date(indexedData.lastUpdated).toISOString());
          setIsDataStale(false); // Assume fresh if in IndexedDB

          const totalSize = JSON.stringify(indexedData).length;
          setStats({
            entitiesCount: indexedData.entities.length,
            edgesCount: indexedData.edges.length,
            totalSize: totalSize
          });
        }
      }
    } catch (error) {
      console.error('Failed to load cached full dataset:', error);
      localStorage.removeItem(FULL_DATASET_KEY);
      localStorage.removeItem(FULL_DATASET_TIMESTAMP_KEY);
    }
  }, []);

  // Load cached data on mount
  useEffect(() => {
    loadCachedData();
  }, [loadCachedData]);

  const downloadFullDataset = useCallback(async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress(0);

    try {
      console.log('Starting full dataset download...');

      // Get dataset statistics first
      const statsResponse = await fetch('/api/graph/full-dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'stats' })
      });

      if (!statsResponse.ok) {
        throw new Error('Failed to get dataset statistics');
      }

      const statsData = await statsResponse.json();
      console.log('Dataset stats:', statsData);

      // Download entities in chunks
      const entities: any[] = [];
      let entityOffset = 0;
      const entityChunkSize = 1000;

      while (entityOffset < statsData.entitiesCount) {
        setDownloadProgress(Math.min(50, (entityOffset / statsData.entitiesCount) * 50));
        
        const response = await fetch(
          `/api/graph/full-dataset?type=entities&chunkSize=${entityChunkSize}&offset=${entityOffset}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch entities chunk at offset ${entityOffset}`);
        }

        const chunkData = await response.json();
        entities.push(...chunkData.data);

        if (!chunkData.hasMore) break;
        entityOffset += entityChunkSize;

        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Downloaded ${entities.length} entities`);

      // Download edges in chunks
      const edges: any[] = [];
      let edgeOffset = 0;
      const edgeChunkSize = 2000;

      while (edgeOffset < statsData.edgesCount) {
        setDownloadProgress(50 + Math.min(50, (edgeOffset / statsData.edgesCount) * 50));
        
        const response = await fetch(
          `/api/graph/full-dataset?type=edges&chunkSize=${edgeChunkSize}&offset=${edgeOffset}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch edges chunk at offset ${edgeOffset}`);
        }

        const chunkData = await response.json();
        edges.push(...chunkData.data);

        if (!chunkData.hasMore) break;
        edgeOffset += edgeChunkSize;

        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Downloaded ${edges.length} edges`);

      // Clean person names in entities
      const cleanedEntities = entities.map(entity => ({
        ...entity,
        name: cleanPersonName(entity.name, entity.type)
      }));

      // Create the full dataset
      const dataset: FullDataset = {
        entities: cleanedEntities,
        edges: edges,
        lastUpdated: Date.now(),
        version: '2.0.0'
      };

      // Save to localStorage with compression
      try {
        // Compress the dataset by removing unnecessary fields
        const compressedDataset = {
          entities: dataset.entities.map(entity => ({
            id: entity.id,
            name: entity.name,
            type: entity.type,
            domain: entity.domain,
            industry: entity.industry,
            pipeline_stage: entity.pipeline_stage,
            fund: entity.fund,
            taxonomy: entity.taxonomy,
            is_internal: entity.is_internal,
            is_portfolio: entity.is_portfolio,
            is_pipeline: entity.is_pipeline,
            importance: entity.importance
          })),
          edges: dataset.edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            kind: edge.kind,
            strength_score: edge.strength_score
          })),
          lastUpdated: dataset.lastUpdated,
          version: dataset.version
        };
        
        const compressedData = JSON.stringify(compressedDataset);
        localStorage.setItem(FULL_DATASET_KEY, compressedData);
        localStorage.setItem(FULL_DATASET_TIMESTAMP_KEY, new Date().toISOString());
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.warn('localStorage quota exceeded, using IndexedDB fallback');
          // Fallback to IndexedDB for large datasets
          await saveToIndexedDB(dataset);
        } else {
          throw error;
        }
      }

      setFullDataset(dataset);
      setLastUpdated(new Date().toISOString());
      setIsDataStale(false);
      setDownloadProgress(100);

      // Calculate and set stats
      const totalSize = JSON.stringify(dataset).length;
      setStats({
        entitiesCount: dataset.entities.length,
        edgesCount: dataset.edges.length,
        totalSize: totalSize
      });

      console.log('Full dataset download completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to download full dataset';
      setDownloadError(errorMessage);
      console.error('Full dataset download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const clearDataset = useCallback(() => {
    localStorage.removeItem(FULL_DATASET_KEY);
    localStorage.removeItem(FULL_DATASET_TIMESTAMP_KEY);
    setFullDataset(null);
    setLastUpdated(null);
    setIsDataStale(false);
    setStats(null);
  }, []);

  const cleanPersonName = (name: string, type: string) => {
    if (type === 'person' && name.includes(';')) {
      return name.split(';')[0].trim();
    }
    return name;
  };

  return {
    fullDataset,
    isDownloading,
    downloadProgress,
    downloadError,
    isDataStale,
    lastUpdated,
    downloadFullDataset,
    clearDataset,
    stats
  };
}
