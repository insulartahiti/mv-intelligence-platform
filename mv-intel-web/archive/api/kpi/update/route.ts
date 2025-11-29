import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest){
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { orgId, companyId, name, value, unit, period, source, actor } = await req.json();
  if (!orgId || !companyId || !name) return NextResponse.json({ error: 'orgId, companyId, name required' }, { status: 400 });

  const { data: last } = await admin.from('metrics').select('value').eq('org_id', orgId).eq('company_id', companyId).eq('name', name).order('created_at', { ascending:false }).limit(1);
  const oldVal = last?.[0]?.value ?? null;

  await admin.from('metrics').insert({ org_id: orgId, company_id: companyId, name, value, unit, period, source });
  await admin.from('metric_audit').insert({ org_id: orgId, company_id: companyId, name, old_value: oldVal, new_value: value, unit, period, source, actor, approved: true });

  return NextResponse.json({ ok:true });
}
