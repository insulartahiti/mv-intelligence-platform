import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface AffinityOrganization {
  id: string;
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  company_type: 'startup' | 'scaleup' | 'enterprise';
  created_at: string;
  status: 'active' | 'inactive';
  metadata: {
    employees?: string;
    funding_stage?: string;
    revenue_range?: string;
    location?: string;
  };
}

interface CreateOrganizationRequest {
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  company_type?: 'startup' | 'scaleup' | 'enterprise';
  employees?: string;
  funding_stage?: string;
  revenue_range?: string;
  location?: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain');
    const name = searchParams.get('name');
    const orgId = searchParams.get('id');

    if (!AFFINITY_API_KEY) {
      return NextResponse.json({ 
        error: 'Affinity API key not configured. Please configure AFFINITY_API_KEY environment variable.' 
      }, { status: 500 });
    }

    if (orgId) {
      // Get specific organization
      const organization = await getAffinityOrganization(orgId, AFFINITY_API_KEY);
      if (!organization) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }
      return NextResponse.json({ organization });
    }

    // Search organizations
    const organizations = await searchAffinityOrganizations({ 
      domain: domain || undefined, 
      name: name || undefined 
    }, AFFINITY_API_KEY);
    return NextResponse.json({ organizations });

  } catch (error: any) {
    console.error('Error fetching Affinity organizations:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch organizations: ' + error.message 
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const orgData: CreateOrganizationRequest = await req.json();

    if (!AFFINITY_API_KEY) {
      return NextResponse.json({ 
        error: 'Affinity API key not configured. Please configure AFFINITY_API_KEY environment variable.' 
      }, { status: 500 });
    }

    const organization = await createAffinityOrganization(orgData, AFFINITY_API_KEY);
    return NextResponse.json({ organization });

  } catch (error: any) {
    console.error('Error creating Affinity organization:', error);
    return NextResponse.json({ 
      error: 'Failed to create organization: ' + error.message 
    }, { status: 500 });
  }
}

async function getAffinityOrganization(orgId: string, apiKey: string): Promise<AffinityOrganization | null> {
  try {
    const response = await fetch(`https://api.affinity.co/organizations/${orgId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Affinity API error: ${response.status}`);
    }

    const data = await response.json();
    return transformAffinityOrganization(data);

  } catch (error) {
    console.error('Failed to fetch organization from Affinity:', error);
    return null;
  }
}

async function searchAffinityOrganizations(filters: { domain?: string; name?: string }, apiKey: string): Promise<AffinityOrganization[]> {
  try {
    const params = new URLSearchParams();
    if (filters.domain) params.append('term', filters.domain);
    if (filters.name) params.append('term', filters.name);

    const response = await fetch(`https://api.affinity.co/organizations?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Affinity API error: ${response.status}`);
    }

    const data = await response.json();
    return data.map(transformAffinityOrganization);

  } catch (error) {
    console.error('Failed to search organizations in Affinity:', error);
    return [];
  }
}

async function createAffinityOrganization(orgData: CreateOrganizationRequest, apiKey: string): Promise<AffinityOrganization> {
  try {
    const response = await fetch('https://api.affinity.co/organizations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: orgData.name,
        domain: orgData.domain,
        website: orgData.website,
        industry: orgData.industry,
        company_type: orgData.company_type || 'startup'
      })
    });

    if (!response.ok) {
      throw new Error(`Affinity API error: ${response.status}`);
    }

    const data = await response.json();
    return transformAffinityOrganization(data);

  } catch (error) {
    console.error('Failed to create organization in Affinity:', error);
    throw error;
  }
}

function transformAffinityOrganization(data: any): AffinityOrganization {
  return {
    id: data.id.toString(),
    name: data.name,
    domain: data.domain,
    website: data.website,
    industry: data.industry,
    company_type: data.company_type || 'startup',
    created_at: data.created_at,
    status: data.status || 'active',
    metadata: {
      employees: data.metadata?.employees,
      funding_stage: data.metadata?.funding_stage,
      revenue_range: data.metadata?.revenue_range,
      location: data.metadata?.location
    }
  };
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
