import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NOTIFY_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-slack`;
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || '';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const orgId = searchParams.get('orgId');
  
  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  }

  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
  
  try {
    const { data: actions, error } = await admin
      .from('actions')
      .select(`
        *,
        related_company:companies!actions_related_company_fkey(id, name),
        related_contact:contacts!actions_related_contact_fkey(id, name),
        created_by:profiles!actions_created_by_fkey(full_name)
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ actions: actions || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest){
  const { orgId, items, related_company, related_artifact, due_at } = await req.json();
  if (!orgId || !Array.isArray(items) || items.length===0) return NextResponse.json({ error: 'orgId and items[] required' }, { status: 400 });

  const admin = createClient(URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const rows = items.map((it:any)=>({ org_id: orgId, title: it.title, details: it.details||null, due_at: due_at||null, related_company: related_company||null, related_artifact: related_artifact||null }));
  const { error } = await admin.from('actions').insert(rows as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // optional ephemeral Slack notify (summary)
  try{
    const text = `Created ${rows.length} action(s) for org ${orgId}`;
    await fetch(NOTIFY_URL, { method:'POST', headers:{ 'Content-Type':'application/json', 'x-mv-signature': WEBHOOK_SECRET }, body: JSON.stringify({ text }) });
  }catch{}

  return NextResponse.json({ ok:true, count: rows.length });
}
