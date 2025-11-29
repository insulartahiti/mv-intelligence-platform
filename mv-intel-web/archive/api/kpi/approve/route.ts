import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest){
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { pendingId, actor } = await req.json();
  if (!pendingId) return NextResponse.json({ error: 'pendingId required' }, { status: 400 });
  const { data: p, error: e1 } = await admin.from('metric_pending').select('*').eq('id', pendingId).maybeSingle();
  if (e1 || !p) return NextResponse.json({ error: e1?.message || 'Not found' }, { status: 404 });

  await admin.from('metrics').insert({ org_id: p.org_id, company_id: p.company_id, name: p.name, value: p.value, unit: p.unit, period: p.period, source: p.source });
  await admin.from('metric_audit').insert({ org_id: p.org_id, company_id: p.company_id, name: p.name, old_value: null, new_value: p.value, unit: p.unit, period: p.period, source: p.source, actor, approved: true });
  await admin.from('metric_pending').delete().eq('id', pendingId);

  return NextResponse.json({ ok:true });
}
