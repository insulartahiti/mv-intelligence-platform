import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }){
  const supabase = createClient(URL, ANON, { auth: { persistSession:false } });
  const { data, error } = await supabase.from('company_opportunities_cache').select('data, refreshed_at').eq('company_id', params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ opportunities: data?.data || [], refreshed_at: data?.refreshed_at || null });
}
