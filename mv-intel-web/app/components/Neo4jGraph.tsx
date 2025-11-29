'use client';

import { useEffect, useRef, useState } from 'react';

interface Neo4jGraphProps {
  onNodeClick?: (nodeId: string, nodeData: any) => void;
  onNodeHover?: (nodeId: string, nodeData: any) => void;
  className?: string;
}

export default function Neo4jGraph({ onNodeClick, onNodeHover, className = '' }: Neo4jGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    let neovis: any = null;

    const initializeNeovis = async () => {
      try {
        setLoading(true);
        setError(null);

        // Dynamically import neovis.js
        const Neovis = (await import('neovis.js')).default;

        const config = {
          container_id: containerRef.current?.id || 'neo4j-graph',
          server_url: process.env.NEXT_PUBLIC_NEO4J_URI || 'neo4j+s://d3da2fb9.databases.neo4j.io',
          server_user: process.env.NEXT_PUBLIC_NEO4J_USER || 'neo4j',
          server_password: process.env.NEXT_PUBLIC_NEO4J_PASSWORD || 'xIOfNxiAHpT-g0ZSAQ29TL2C65ck4ZcvLmGUmRaryJc',
          labels: {
            Entity: {
              caption: 'name',
              size: 'importance',
              community: 'type',
              font: {
                size: 14,
                color: '#000000'
              }
            }
          },
          relationships: {
            RELATES: {
              caption: 'kind',
              thickness: 'weight',
              font: {
                size: 12,
                color: '#000000'
              }
            }
          },
          arrows: true,
          hierarchical: false,
          physics: {
            enabled: true,
            stabilization: {
              enabled: true,
              iterations: 100,
              updateInterval: 25,
              onlyDynamicEdges: false,
              fit: true
            },
            barnesHut: {
              gravitationalConstant: -2000,
              centralGravity: 0.1,
              springLength: 200,
              springConstant: 0.04,
              damping: 0.09,
              avoidOverlap: 0.1
            },
            maxVelocity: 50,
            minVelocity: 0.1,
            solver: 'barnesHut',
            timestep: 0.5
          },
          initial_cypher: `
            MATCH (n:Entity)
            WHERE n.importance > 0.5 OR n.is_internal = true
            WITH n
            ORDER BY n.importance DESC, n.name ASC
            LIMIT 100
            MATCH (n)-[r:RELATES]-(m:Entity)
            RETURN n, r, m
          `
        };

        neovis = new Neovis(config as any);
        
        await neovis.render();
        
        // Get stats
        const statsResult = await neovis.stabilized;
        setStats({
          nodes: statsResult.nodes.length,
          edges: statsResult.edges.length
        });

        // Add event listeners
        neovis.on('clickNode', (params: any) => {
          if (onNodeClick) {
            onNodeClick(params.nodeId, params.node);
          }
        });

        neovis.on('hoverNode', (params: any) => {
          if (onNodeHover) {
            onNodeHover(params.nodeId, params.node);
          }
        });

        setLoading(false);
      } catch (err: any) {
        console.error('Neovis initialization error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    if (containerRef.current) {
      initializeNeovis();
    }

    return () => {
      if (neovis) {
        neovis.clear();
      }
    };
  }, [onNodeClick, onNodeHover]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        id="neo4j-graph"
        className="w-full h-full min-h-[600px] bg-gray-50 rounded-lg"
        style={{ minHeight: '600px' }}
      />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading Neo4j graph...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50">
          <div className="text-center p-4">
            <p className="text-red-600 font-medium">Error loading graph</p>
            <p className="text-sm text-red-500 mt-1">{error}</p>
          </div>
        </div>
      )}
      
      {stats && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>{stats.nodes} nodes</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>{stats.edges} edges</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
