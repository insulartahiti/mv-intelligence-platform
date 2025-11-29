'use client';

import { useEffect, useState } from 'react';

export default function DebugTestPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching data...');
        const response = await fetch('/api/neo4j/neovis-data?limit=5&minImportance=0.1');
        console.log('Response received:', response.status);
        
        const result = await response.json();
        console.log('Result:', result);
        
        setData(result);
        setLoading(false);
      } catch (err: any) {
        console.error('Error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Test</h1>
      <div className="bg-gray-100 p-4 rounded">
        <h2 className="font-semibold mb-2">API Response:</h2>
        <pre className="text-sm overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
