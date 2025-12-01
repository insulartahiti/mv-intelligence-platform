import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = 'http://127.0.0.1:54321';
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    }
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_ORG_ID = process.env.AFFINITY_ORG_ID || '123456'; // Default fallback

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { list_name = 'Motive Ventures Pipeline', limit = 5 } = body;

    console.log(`🚀 Starting simple import for list: "${list_name}"`);

    if (!AFFINITY_API_KEY || !AFFINITY_ORG_ID) {
      return NextResponse.json({
        success: false,
        error: 'Missing Affinity API credentials'
      }, { status: 400 });
    }

    // Get organizations from Affinity
    const listResponse = await fetch(`https://api.affinity.co/lists?term=${encodeURIComponent(list_name)}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`
      }
    });

    if (!listResponse.ok) {
      throw new Error(`Failed to get lists: ${listResponse.statusText}`);
    }

    const lists = await listResponse.json();
    const targetList = lists.find((list: any) => list.name === list_name);
    
    if (!targetList) {
      return NextResponse.json({
        success: false,
        error: `List "${list_name}" not found`
      }, { status: 404 });
    }

    console.log(`📋 Found list: ${targetList.name} (${targetList.list_size} items)`);

    // Get organizations in the list
    const orgsResponse = await fetch(`https://api.affinity.co/organizations?list_id=${targetList.id}&page_size=${limit}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`
      }
    });

    if (!orgsResponse.ok) {
      throw new Error(`Failed to get organizations: ${orgsResponse.statusText}`);
    }

    const orgsData = await orgsResponse.json();
    const organizations = orgsData.organizations || orgsData;
    console.log(`📊 Retrieved ${organizations.length} organizations`);

    const results = [];
    const errors = [];

    for (const org of organizations) {
      try {
        console.log(`🔄 Processing organization: ${org.name}`);
        
        // Get detailed organization info
        const orgDetailResponse = await fetch(`https://api.affinity.co/organizations/${org.id}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`
          }
        });

        if (!orgDetailResponse.ok) {
          throw new Error(`Failed to get org details: ${orgDetailResponse.statusText}`);
        }

        const orgDetails = await orgDetailResponse.json();
        console.log(`📋 Org details: ${orgDetails.name} (${orgDetails.domain})`);

        // Insert into database
        const companyData = {
          name: orgDetails.name,
          domain: orgDetails.domain,
          industry: orgDetails.industry,
          description: orgDetails.description,
          affinity_org_id: orgDetails.id,
          website: orgDetails.website,
          employees: orgDetails.employees,
          last_synced_at: new Date().toISOString()
        };

        const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(companyData)
        });

        if (!insertResponse.ok) {
          const errorText = await insertResponse.text();
          throw new Error(`Insert failed: ${insertResponse.statusText} - ${errorText}`);
        }

        const insertedCompany = (await insertResponse.json())[0];
        console.log(`✅ Inserted company: ${insertedCompany.name}`);
        
        results.push({
          id: insertedCompany.id,
          name: insertedCompany.name,
          domain: insertedCompany.domain,
          affinity_org_id: insertedCompany.affinity_org_id
        });

      } catch (error) {
        console.error(`❌ Error processing ${org.name}:`, error);
        errors.push(`${org.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import completed`,
      results: {
        organizations: results,
        total_organizations: results.length,
        errors: errors
      }
    });

  } catch (error) {
    console.error('Simple import error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
