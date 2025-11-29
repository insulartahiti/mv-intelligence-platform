import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }){
  const supabase = createClient(URL, ANON, { auth: { persistSession:false } });
  const orgId = req.nextUrl.searchParams.get('orgId') || '';
  const companyId = params.id;
  const { data, error } = await supabase.from('company_top_contacts')
    .select('*')
    .eq('org_id', orgId)
    .eq('company_id', companyId)
    .order('strength', { ascending:false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data || [] });
}
