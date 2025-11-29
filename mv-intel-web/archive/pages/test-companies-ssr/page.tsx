import { NextRequest, NextResponse } from 'next/server';

async function getCompanies() {
  const response = await fetch('http://localhost:3000/api/companies');
  const data = await response.json();
  return data.companies || [];
}

export default async function TestCompaniesSSRPage() {
  const companies = await getCompanies();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Companies SSR Test Page</h1>
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



