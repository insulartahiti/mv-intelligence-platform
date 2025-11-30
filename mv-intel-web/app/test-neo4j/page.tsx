'use client';

import Neo4jGraphViewer from '../components/Neo4jGraphViewer';

export default function TestNeo4jPage() {
  const handleNodeClick = (nodeId: string, nodeData: any) => {
    console.log('Node clicked:', nodeId, nodeData);
  };

  const handleNodeHover = (nodeId: string, nodeData: any) => {
    console.log('Node hovered:', nodeId, nodeData);
  };

  return (
    <div className="h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-lg h-full">
        <div className="p-4 border-b">
          <h1 className="text-2xl font-bold">Neo4j Graph Test</h1>
          <p className="text-gray-600">Testing the new Neo4jGraphViewer component</p>
        </div>
        <div className="h-[calc(100%-80px)]">
          <Neo4jGraphViewer
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            limit={500}
            minImportance={0.1}
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}