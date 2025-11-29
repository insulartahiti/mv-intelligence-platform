'use client';
import { useState, useEffect } from 'react';

export default function TestCompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/companies');
        const data = await response.json();
        
        console.log('Companies response:', data);
        
        if (response.ok) {
          setCompanies(data.companies || []);
        } else {
          setError(data.error || 'Failed to load companies');
        }
      } catch (err: any) {
        setError(err.message);
        console.error('Error loading companies:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCompanies();
  }, []);

  if (loading) return <div className="p-8">Loading companies...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Companies Test Page</h1>
      <p className="mb-4">Found {companies.length} companies</p>
      
      <div className="space-y-2">
        {companies.map((company: any) => (
          <div key={company.id} className="p-4 border rounded">
            <h3 className="font-semibold">{company.name}</h3>
            <p className="text-sm text-gray-600">Domain: {company.domain}</p>
            <p className="text-sm text-gray-600">Affinity ID: {company.affinity_org_id}</p>
          </div>
        ))}
      </div>
    </div>
  );
}



