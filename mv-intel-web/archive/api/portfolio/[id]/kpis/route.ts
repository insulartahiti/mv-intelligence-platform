import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }){
  const supabase = createClient(URL, ANON, { auth: { persistSession:false } });
  const orgId = req.nextUrl.searchParams.get('orgId') || '';
  const companyId = params.id;
  const { data, error } = await supabase
    .from('metrics')
    .select('name,value,unit,period,created_at')
    .eq('org_id', orgId)
    .eq('company_id', companyId)
    .order('created_at', { ascending:true })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metrics: data || [] });
}
