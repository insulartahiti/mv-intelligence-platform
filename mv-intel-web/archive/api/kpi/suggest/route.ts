import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest){
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { orgId, companyId, name, value, unit, period, source, evidence, createdBy } = await req.json();
  if (!orgId || !companyId || !name) return NextResponse.json({ error: 'orgId, companyId, name required' }, { status: 400 });
  const { data, error } = await admin.from('metric_pending').insert({ org_id: orgId, company_id: companyId, name, value, unit, period, source, evidence, created_by: createdBy||null }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, id: data.id });
}
