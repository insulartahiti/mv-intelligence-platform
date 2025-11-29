'use client';

import SimpleNeo4jTest from '../components/SimpleNeo4jTest';

export default function SimpleTestPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Simple Neo4j Test</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Simple Graph Test</h2>
          <div className="h-[500px] border border-gray-300 rounded-lg">
            <SimpleNeo4jTest limit={50} minImportance={0.1} />
          </div>
        </div>
      </div>
    </div>
  );
}
