import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-side secret
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

function chunk(text: string, size=900, overlap=120){
  const out:string[]=[]; let i=0; while(i<text.length){ out.push(text.slice(i,i+size)); i+= (size-overlap); } return out;
}
async function embedBatch(chunks: string[]){
  const r=await fetch('https://api.openai.com/v1/embeddings',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${OPENAI_API_KEY}` }, body: JSON.stringify({ input: chunks, model:'text-embedding-3-small' }) });
  const j=await r.json(); return j.data.map((d:any)=>d.embedding);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }){
  const artifactId = params.id;
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const body = await req.json();
  const slides = body.slides as Array<{ id:number; slide_index:number; image_url:string; ocr_text:string }>;
  if (!slides?.length) return NextResponse.json({ updated:0, embedded:0 });

  // fetch artifact to get org_id
  const { data: art, error: aerr } = await admin.from('artifacts').select('id, org_id').eq('id', artifactId).single();
  if (aerr || !art) return NextResponse.json({ error: aerr?.message || 'Artifact not found' }, { status: 404 });

  // Update slides
  for (const s of slides){ await admin.from('slides').update({ ocr_text: s.ocr_text }).eq('id', s.id); }

  // Re-embed: concatenate ordered text
  const ordered = slides.sort((a,b)=>a.slide_index-b.slide_index).map(s=>`Slide ${s.slide_index}:\n${s.ocr_text||''}`).join('\n\n');
  const chunks = chunk(ordered);
  const vectors = await embedBatch(chunks);

  // Delete old embeddings and insert new with org_id
  await admin.from('embeddings').delete().eq('artifact_id', artifactId);
  const rows = chunks.map((c,i)=>({ artifact_id: artifactId, org_id: art.org_id, chunk_id:`edit${i}`, content:c, metadata:{ from:'manual_edit' }, embedding: vectors[i] }));
  const { error } = await admin.from('embeddings').insert(rows as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: slides.length, embedded: chunks.length });
}
