import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest){
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { profileId, role } = await req.json();
  if (!profileId || !role) return NextResponse.json({ error: 'profileId and role required' }, { status: 400 });
  const { error } = await admin.from('profiles').update({ role }).eq('id', profileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true });
}
