import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET specific deal with memo
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const dealId = params.id;
    
    // Get deal memo with company information
    const { data: deal, error } = await admin
      .from('deal_memos')
      .select(`
        id,
        title,
        markdown,
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
          funding_stage,
          description
        )
      `)
      .eq('id', dealId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
      }
      console.error('Error fetching deal:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform data for frontend
    const company = deal.companies?.[0] || {};
    const transformedDeal = {
      id: deal.id,
      name: deal.title || company.name || 'Untitled Deal',
      company: company.name || 'Unknown Company',
      domain: company.domain,
      industry: company.industry,
      company_type: company.company_type,
      funding_stage: company.funding_stage,
      description: company.description,
      opportunity_id: deal.opportunity_id,
      last_drafted_at: deal.last_drafted_at,
      created_at: deal.created_at,
      updated_at: deal.updated_at,
      stage: deal.opportunity_id ? 'Active' : 'Draft',
      memo: deal.markdown || ''
    };

    return NextResponse.json({ data: transformedDeal });

  } catch (error: any) {
    console.error('Error in deal GET:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// UPDATE deal memo
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const dealId = params.id;
    const { markdown, title } = await req.json();
    
    if (!markdown) {
      return NextResponse.json({ error: 'markdown content is required' }, { status: 400 });
    }

    // Update deal memo
    const { data, error } = await admin
      .from('deal_memos')
      .update({ 
        markdown,
        ...(title && { title }),
        updated_at: new Date().toISOString()
      })
      .eq('id', dealId)
      .select('id, updated_at')
      .single();

    if (error) {
      console.error('Error updating deal memo:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      id: data.id,
      updated_at: data.updated_at 
    });

  } catch (error: any) {
    console.error('Error in deal PUT:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}






