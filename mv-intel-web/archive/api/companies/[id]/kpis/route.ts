import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });
  
  try {
    const companyId = params.id;

    // Get all metrics for the company
    const { data: metrics, error } = await supabase
      .from('metrics')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ metrics: metrics || [] });

  } catch (error: any) {
    console.error('Error fetching KPIs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch KPIs: ' + error.message 
    }, { status: 500 });
  }
}






