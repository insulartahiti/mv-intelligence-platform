import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const { searchParams } = req.nextUrl;
    const orgId = searchParams.get('orgId') || process.env.AFFINITY_ORG_ID || '7624528';
    
    // Get deal memos with company information
    const { data: deals, error } = await admin
      .from('deal_memos')
      .select(`
        id,
        title,
        opportunity_id,
        last_drafted_at,
        created_at,
        updated_at,
        companies!deal_memos_company_id_fkey (
          id,
          name,
          domain,
          industry,
          company_type,
          funding_stage
        )
      `)
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching deals:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform data for frontend
    const transformedDeals = (deals || []).map(deal => {
      const company = deal.companies?.[0] || {};
      return {
        id: deal.id,
        name: deal.title || company.name || 'Untitled Deal',
        company: company.name || 'Unknown Company',
        domain: company.domain,
        industry: company.industry,
        company_type: company.company_type,
        funding_stage: company.funding_stage,
      opportunity_id: deal.opportunity_id,
      last_drafted_at: deal.last_drafted_at,
      created_at: deal.created_at,
      updated_at: deal.updated_at,
        stage: deal.opportunity_id ? 'Active' : 'Draft'
      };
    });

    return NextResponse.json({ 
      data: transformedDeals,
      count: transformedDeals.length 
    });

  } catch (error: any) {
    console.error('Error in deals GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const { orgId, companyId, opportunityId, title } = await req.json();
    
    if (!orgId || !companyId) {
      return NextResponse.json({ error: 'orgId and companyId required' }, { status: 400 });
    }

    // Create new deal memo
    const { data, error } = await admin
      .from('deal_memos')
      .insert({ 
        org_id: orgId, 
        company_id: companyId, 
        opportunity_id: opportunityId || null, 
        title: title || null 
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating deal:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });

  } catch (error: any) {
    console.error('Error in deals POST:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
