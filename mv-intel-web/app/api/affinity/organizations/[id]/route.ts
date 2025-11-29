import { NextRequest, NextResponse } from 'next/server';

// Affinity API configuration
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY || process.env.SUPABASE_AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

// Function to get organization by ID from Affinity
async function getAffinityOrganization(orgId: string, apiKey: string) {
  try {
    const response = await fetch(`${AFFINITY_BASE_URL}/organizations/${orgId}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Affinity API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      domain: data.domain,
      status: data.status,
      affinity_id: data.id,
      list_ids: data.list_ids || [],
      person_ids: data.person_ids || [],
      deal_ids: data.deal_ids || [],
      metadata: {
        description: data.description,
        tags: data.tags || [],
        employees: data.employees,
        funding_stage: data.funding_stage,
        revenue_range: data.revenue_range,
        location: data.location
      }
    };
  } catch (error) {
    console.error('Failed to fetch organization from Affinity:', error);
    return null;
  }
}

// Mock organization for development
function getMockAffinityOrganization(orgId: string) {
  const mockOrgs: { [key: string]: any } = {
    '1': {
      id: 1,
      name: 'Test Organization',
      domain: 'test.com',
      status: 'active',
      affinity_id: 1,
      list_ids: [],
      person_ids: [],
      deal_ids: [],
      metadata: {
        description: 'Test organization for development',
        tags: ['test', 'development'],
        employees: 10,
        funding_stage: 'seed',
        revenue_range: '$1M-$10M',
        location: 'San Francisco, CA'
      }
    }
  };

  return mockOrgs[orgId] || null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orgId = params.id;

    if (!orgId) {
      return NextResponse.json({
        status: 'error',
        message: 'Organization ID is required'
      }, { status: 400 });
    }

    // Try to get API key from environment
    let apiKey = AFFINITY_API_KEY;
    
    if (apiKey) {
      // Use real Affinity API
      const org = await getAffinityOrganization(orgId, apiKey);
      
      if (org) {
        return NextResponse.json({
          status: 'success',
          data: org
        });
      } else {
        return NextResponse.json({
          status: 'error',
          message: 'Organization not found'
        }, { status: 404 });
      }
    } else {
      // Use mock data for development
      const org = getMockAffinityOrganization(orgId);
      
      if (org) {
        return NextResponse.json({
          status: 'success',
          data: org,
          mock: true
        });
      } else {
        return NextResponse.json({
          status: 'error',
          message: 'Organization not found'
        }, { status: 404 });
      }
    }

  } catch (error) {
    console.error('Failed to fetch organization:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
