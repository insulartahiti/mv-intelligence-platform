import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
  
  try {
    const companyId = params.id;

    // Fetch company basic info
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, domain, description, affinity_org_id')
      .eq('id', companyId)
      .single();

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 404 });
    }

    // Fetch metrics
    const { data: metrics, error: metricsError } = await supabase
      .from('metrics')
      .select('name, value, unit, period, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Fetch news
    const { data: news, error: newsError } = await supabase
      .from('company_news_links')
      .select(`
        news_id,
        news_items (
          id,
          title,
          url,
          source,
          published_at
        )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch opportunities if company has Affinity org ID
    let opportunities = [];
    if (company.affinity_org_id) {
      try {
        const oppsResponse = await fetch(`${req.nextUrl.origin}/api/companies/${companyId}/opportunities`, {
          cache: 'no-store'
        });
        const oppsData = await oppsResponse.json();
        opportunities = oppsData.opportunities || [];
      } catch (error) {
        console.warn('Failed to fetch opportunities:', error);
      }
    }

    return NextResponse.json({
      data: {
        ...company,
        metrics: metrics || [],
        news: (news || []).map(item => item.news_items).filter(Boolean),
        opportunities: opportunities
      }
    });

  } catch (error: any) {
    console.error('Error fetching company data:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch company data: ' + error.message 
    }, { status: 500 });
  }
}






