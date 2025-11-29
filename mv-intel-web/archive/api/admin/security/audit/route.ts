import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(){
  if (!URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
  }
  
  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const { data, error } = await admin.rpc('mv_security_audit');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ audit: data });
}
