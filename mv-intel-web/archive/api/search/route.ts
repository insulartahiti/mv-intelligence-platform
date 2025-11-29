import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

async function embed(text: string){
  const r = await fetch('https://api.openai.com/v1/embeddings', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${OPENAI_API_KEY}` }, body: JSON.stringify({ input: text, model:'text-embedding-3-small' }) });
  const j = await r.json(); return j.data[0].embedding;
}

export async function GET(req: NextRequest){
  const q = req.nextUrl.searchParams.get('q')||'';
  const orgId = req.nextUrl.searchParams.get('orgId')||'';
  if (!q || !orgId) return NextResponse.json({ results: [] });
  const e = await embed(q);
  const supabase = createClient(url, anon, { auth: { persistSession:false } });
  const { data, error } = await supabase.rpc('match_embeddings', { p_org_id: orgId, p_query_embedding: e, p_match_count: 12 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: data });
}