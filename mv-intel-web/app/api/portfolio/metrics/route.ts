import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to create Supabase client lazily
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in environment variables.'
    );
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    
    console.log('[Metrics API] Request for companyId:', companyId);
    
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    
    // Fetch BOTH fact_metrics and fact_financials in parallel
    const [metricsResult, financialsResult] = await Promise.all([
      // 1. Computed KPIs from fact_metrics
      supabase
        .from('fact_metrics')
        .select('*')
        .eq('company_id', companyId)
        .order('period', { ascending: true }),
      
      // 2. Raw line items from fact_financials (no limit - show all periods)
      supabase
        .from('fact_financials')
        .select('id, line_item_id, amount, date, scenario, currency, source_location, snippet_url')
        .eq('company_id', companyId)
        .order('date', { ascending: true })
    ]);
    
    const { data: metrics, error: metricsError } = metricsResult;
    const { data: financials, error: financialsError } = financialsResult;
    
    console.log('[Metrics API] Results - metrics:', metrics?.length || 0, 'financials:', financials?.length || 0);
    
    if (metricsError) {
      console.error('Error fetching metrics:', metricsError);
    }
    if (financialsError) {
      console.error('Error fetching financials:', financialsError);
    }

    // Group financials by scenario for easy access
    const actuals = financials?.filter(f => f.scenario?.toLowerCase() === 'actual') || [];
    const budget = financials?.filter(f => f.scenario?.toLowerCase() === 'budget') || [];
    const forecast = financials?.filter(f => f.scenario?.toLowerCase() === 'forecast') || [];

    return NextResponse.json({ 
      metrics: metrics || [],
      financials: {
        actuals,
        budget,
        forecast,
        total: financials?.length || 0
      }
    });
  } catch (error: any) {
    console.error('Internal error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
