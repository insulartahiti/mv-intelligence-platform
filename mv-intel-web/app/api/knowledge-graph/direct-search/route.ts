import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, type = 'universal' } = body;

    console.log(`🔍 Direct search request: "${query}"`);

    // Search companies with intelligence overlays
    const companiesResponse = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=*&name=ilike.*${encodeURIComponent(query)}*`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const companiesData = await companiesResponse.json();
    console.log('Companies response:', companiesData);

    // Get intelligence overlays for companies (most recent for each company)
    const intelligenceResponse = await fetch(`${SUPABASE_URL}/rest/v1/intelligence_overlays?select=*&company_id=in.(${companiesData.map((c: any) => c.id).join(',')})&order=last_updated.desc`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const intelligenceData = await intelligenceResponse.json();
    console.log('Intelligence response:', intelligenceData);

    // Search contacts
    const contactsResponse = await fetch(`${SUPABASE_URL}/rest/v1/contacts?select=*&name=ilike.*${encodeURIComponent(query)}*`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const contactsData = await contactsResponse.json();
    console.log('Contacts response:', contactsData);

    // Format results
    const results = [];
    
    if (Array.isArray(companiesData)) {
      results.push(...companiesData.map(company => {
        // Find intelligence overlay for this company (most recent)
        const intelligence = Array.isArray(intelligenceData) 
          ? intelligenceData.find((intel: any) => intel.company_id === company.id)
          : null;

        return {
          type: 'company',
          id: company.id,
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          description: company.description,
          affinity_org_id: company.affinity_org_id,
          created_at: company.created_at,
          updated_at: company.updated_at,
          existing_intelligence: intelligence ? {
            relationship_strength: intelligence.relationship_strength,
            context: intelligence.context,
            opportunities: intelligence.opportunities,
            risk_factors: intelligence.risk_factors,
            next_best_action: intelligence.next_best_action,
            confidence_score: intelligence.confidence_score,
            insights: intelligence.insights,
            last_updated: intelligence.last_updated
          } : null
        };
      }));
    }

    if (Array.isArray(contactsData)) {
      results.push(...contactsData.map(contact => ({
        type: 'contact',
        id: contact.id,
        name: contact.name,
        email: contact.email,
        title: contact.title,
        company_id: contact.company_id,
        affinity_person_id: contact.affinity_person_id,
        created_at: contact.created_at,
        updated_at: contact.updated_at
      })));
    }

    return NextResponse.json({
      ok: true,
      query: {
        intent: 'direct_search',
        search_terms: [query],
        max_results: 20
      },
      results,
      count: results.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Direct search API error:', error);
    return NextResponse.json(
      { 
        ok: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
