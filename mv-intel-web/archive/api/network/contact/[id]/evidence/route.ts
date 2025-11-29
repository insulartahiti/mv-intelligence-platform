import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest, { params }: { params: { id: string } }){
  const supabase = createClient(URL, ANON, { auth: { persistSession:false } });
  const contactId = params.id;
  const orgId = req.nextUrl.searchParams.get('orgId') || '';

  // top embeddings chunks
  const { data: chunks } = await supabase.from('embeddings')
    .select('content, created_at')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(12);

  // recent activities mentioning this contact email/name (if we can look it up)
  const { data: contact } = await supabase.from('contacts').select('name,email').eq('id', contactId).single();
  const needle = (contact?.email || contact?.name || '').toLowerCase();
  let acts:any[] = [];
  if (needle){
    const { data: a } = await supabase.from('activities').select('verb, meta, created_at').eq('org_id', orgId).order('created_at', { ascending:false }).limit(50);
    acts = (a||[]).filter(x => JSON.stringify(x.meta||{}).toLowerCase().includes(needle)).slice(0,8);
  }

  // recent events involving the contact
  let evts:any[] = [];
  if (needle){
    const { data: e } = await supabase.from('events').select('title, starts_at, attendees, company_id').eq('org_id', orgId).order('starts_at', { ascending:false }).limit(50);
    evts = (e||[]).filter(x => JSON.stringify(x.attendees||[]).toLowerCase().includes(needle)).slice(0,8);
  }

  return NextResponse.json({ chunks: chunks||[], activities: acts, events: evts });
}
