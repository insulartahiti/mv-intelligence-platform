import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest){
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { orgId, title, related_company, related_contact, due_at, source, payload, created_by } = await req.json();
  if (!orgId || !title) return NextResponse.json({ error: 'orgId and title required' }, { status: 400 });
  const { data, error } = await admin.from('actions').insert({ org_id: orgId, title, related_company: related_company||null, related_contact: related_contact||null, due_at: due_at||null, source: source||'manual', payload: payload||{}, created_by: created_by||null }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, id: data.id });
}
