import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }){
  const supabase = createClient(URL, ANON, { auth: { persistSession:false } });
  const { data, error } = await supabase.rpc('news_for_company_detailed', { p_company_id: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
