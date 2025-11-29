import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

export async function POST(req: NextRequest, { params }: { params: { id: string } }){
  const artifactId = params.id;
  const supabase = createClient(URL, ANON, { auth: { persistSession: false } });

  const { data: slides, error } = await supabase.from('slides').select('slide_index, ocr_text').eq('artifact_id', artifactId).order('slide_index');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const text = (slides||[]).map(s=>`Slide ${s.slide_index}:\n${s.ocr_text||''}`).join('\n\n') || 'No text';

  const prompt = `You are a venture investor. Summarize into: Product, Market, Traction/KPIs, Business Model, Team, Risks, Questions.`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model:'gpt-4o-mini', messages:[{ role:'system', content: prompt }, { role:'user', content: text.slice(0,12000) }] })
  });
  const j = await r.json();
  const summary = j.choices?.[0]?.message?.content || '';

  const { error: upErr } = await supabase.from('artifacts').update({ summary: { text: summary } }).eq('id', artifactId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok:true, summary });
}
