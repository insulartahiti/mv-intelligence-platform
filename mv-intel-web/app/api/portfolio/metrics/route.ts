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
    
    if (!companyId) {
      return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    
    // Fetch metrics sorted by period (ascending)
    const { data: metrics, error } = await supabase
      .from('fact_metrics')
      .select('*')
      .eq('company_id', companyId)
      .order('period', { ascending: true });
      
    if (error) {
      console.error('Error fetching metrics:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error('Internal error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

