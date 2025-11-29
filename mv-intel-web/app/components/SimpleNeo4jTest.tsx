'use client';

import { useEffect, useState, useRef } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

interface SimpleNeo4jTestProps {
  limit?: number;
  minImportance?: number;
}

export default function SimpleNeo4jTest({ limit = 100, minImportance = 0.1 }: SimpleNeo4jTestProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebugInfo = (info: string) => {
    console.log('SimpleNeo4jTest:', info);
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${info}`]);
  };

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        addDebugInfo('Starting to load data...');
        setLoading(true);
        setError(null);

        addDebugInfo('Making API call...');
        const response = await fetch(
          `/api/neo4j/neovis-data?limit=${limit}&minImportance=${minImportance}`
        );
        
        addDebugInfo(`API response received: ${response.status}`);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        addDebugInfo(`API result: success=${result.success}, nodes=${result.data?.nodes?.length}`);

        if (!isMounted) {
          addDebugInfo('Component unmounted, aborting');
          return;
        }

        if (result.success && result.data) {
          const { nodes, edges } = result.data;
          addDebugInfo(`Processing ${nodes.length} nodes and ${edges.length} edges`);

          // Simple data conversion
          const visNodes = new DataSet(
            nodes.slice(0, 10).map((node: any, index: number) => ({
              id: node.id || `node-${index}`,
              label: node.label || `Node ${index}`,
              color: '#3b82f6',
              size: 20
            }))
          );

          const visEdges = new DataSet(
            edges.slice(0, 5).map((edge: any, index: number) => ({
              id: edge.id || `edge-${index}`,
              from: edge.from,
              to: edge.to,
              color: '#848484',
              width: 2
            }))
          );

          addDebugInfo(`Created ${visNodes.length} vis nodes and ${visEdges.length} vis edges`);

          if (containerRef.current) {
            addDebugInfo('Container ref available, creating network...');
            
            const data = { nodes: visNodes, edges: visEdges };
            const options = {
              nodes: {
                shape: 'dot',
                font: { size: 12, color: '#000000' }
              },
              edges: {
                width: 2,
                color: { color: '#848484' }
              },
              physics: {
                enabled: true,
                stabilization: { enabled: true, iterations: 50 }
              }
            };

            try {
              networkRef.current = new Network(containerRef.current, data as any, options);
              addDebugInfo('Network created successfully!');
              setLoading(false);
            } catch (networkError) {
              addDebugInfo(`Network creation failed: ${networkError}`);
              throw networkError;
            }
          } else {
            addDebugInfo('Container ref not available!');
            throw new Error('Container not available');
          }
        } else {
          addDebugInfo('API result not successful or no data');
          throw new Error('No data received');
        }
      } catch (err: any) {
        addDebugInfo(`Error: ${err.message}`);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [limit, minImportance]);

  return (
    <div className="w-full h-full relative">
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px] bg-gray-50 rounded-lg"
        style={{ minHeight: '400px' }}
      />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading simple test...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50">
          <div className="text-center p-4">
            <p className="text-red-600 font-medium">Error: {error}</p>
          </div>
        </div>
      )}

      {/* Debug info panel */}
      <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 max-w-md max-h-64 overflow-y-auto">
        <h4 className="font-semibold text-sm mb-2">Debug Info:</h4>
        <div className="text-xs space-y-1">
          {debugInfo.map((info, index) => (
            <div key={index} className="text-gray-600">{info}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
