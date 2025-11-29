import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest){
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { orgId, signalId, created_by } = await req.json();
  if (!orgId || !signalId) return NextResponse.json({ error: 'orgId and signalId required' }, { status: 400 });

  const { data: s, error: e1 } = await admin.from('company_signals').select('*').eq('id', signalId).maybeSingle();
  if (e1 || !s) return NextResponse.json({ error: e1?.message || 'Signal not found' }, { status: 404 });

  const title = `[${s.type}] ${s.title}`;
  const payload = { evidence: s.evidence || [], signal_id: s.id };
  const { data, error } = await admin.from('actions').insert({ org_id: s.org_id, title, related_company: s.company_id, source: 'signal', payload, created_by: created_by||null }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, id: data.id });
}
