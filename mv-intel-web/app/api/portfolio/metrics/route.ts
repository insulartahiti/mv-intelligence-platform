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
    
    // Fetch metrics sorted by period (ascending)
    const { data: metrics, error, count } = await supabase
      .from('fact_metrics')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('period', { ascending: true });
    
    console.log('[Metrics API] Query result - count:', count, 'error:', error?.message);
      
    if (error) {
      console.error('Error fetching metrics:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no metrics found, also try to return fact_financials as fallback data
    if (!metrics || metrics.length === 0) {
      console.log('[Metrics API] No metrics found, checking fact_financials...');
      
      const { data: facts, count: factsCount } = await supabase
        .from('fact_financials')
        .select('line_item_id, amount, date, scenario', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('scenario', 'actual')
        .order('date', { ascending: false })
        .limit(20);
      
      console.log('[Metrics API] fact_financials count:', factsCount);
      
      // Convert facts to metric-like format for display
      if (facts && facts.length > 0) {
        const derivedMetrics = facts.map(f => ({
          id: `derived-${f.line_item_id}-${f.date}`,
          metric_id: f.line_item_id,
          value: f.amount,
          period: f.date,
          unit: 'EUR'
        }));
        return NextResponse.json({ metrics: derivedMetrics, source: 'fact_financials' });
      }
    }

    return NextResponse.json({ metrics: metrics || [] });
  } catch (error: any) {
    console.error('Internal error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

