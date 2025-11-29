import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  const supabase = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, name, domain, description, affinity_org_id, industry, funding_stage, employees, created_at')
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ companies: companies || [] });

  } catch (error: any) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch companies: ' + error.message 
    }, { status: 500 });
  }
}



