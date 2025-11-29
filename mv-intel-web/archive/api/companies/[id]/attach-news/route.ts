import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest, { params }: { params: { id: string } }){
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { newsId } = await req.json();
  if (!newsId) return NextResponse.json({ error: 'newsId required' }, { status: 400 });
  const { error } = await admin.from('company_news_links').insert({ company_id: params.id, news_id: newsId }).select('company_id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true });
}
