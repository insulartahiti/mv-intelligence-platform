import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

function basicAuth(): Record<string, string> { if(!AFFINITY_API_KEY) return {}; const token = Buffer.from(':'+AFFINITY_API_KEY).toString('base64'); return { Authorization: `Basic ${token}` }; }

export async function POST(req: NextRequest, { params }: { params: { id: string } }){
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession:false } });
  const artifactId = params.id;
  const { name, domain } = await req.json();

  // find artifact and org_id
  const { data: art, error: aerr } = await admin.from('artifacts').select('id, org_id').eq('id', artifactId).single();
  if (aerr || !art) return NextResponse.json({ error: aerr?.message || 'Artifact not found' }, { status: 404 });

  // upsert company
  let companyId: string | null = null;
  const { data: c0 } = await admin.from('companies').select('id').eq('org_id', art.org_id).eq('name', name).maybeSingle();
  if (c0?.id) companyId = c0.id;
  else {
    const { data: created, error: cerr } = await admin.from('companies').insert({ org_id: art.org_id, name, domain }).select('id').single();
    if (cerr) return NextResponse.json({ error: cerr.message }, { status: 500 });
    companyId = created.id;
  }

  // link artifact to company
  await admin.from('artifacts').update({ company_id: companyId }).eq('id', artifactId);
  // watchlist
  await admin.from('company_watchlist').upsert({ org_id: art.org_id, company_id: companyId }, { onConflict: 'org_id,company_id' });

  // Optional: map Affinity org id by search
  let affinity_org_id: number | null = null;
  if (AFFINITY_API_KEY && name){
    try{
      const url = new URL(`${AFFINITY_BASE_URL}/organizations`);
      url.searchParams.set('term', domain || name);
      const r = await fetch(url.toString(), { headers: { ...basicAuth() } });
      if (r.ok){ const j = await r.json(); const arr = Array.isArray(j.organizations)? j.organizations : j.organizations ?? j; if (Array.isArray(arr) && arr.length) affinity_org_id = arr[0].id; }
    }catch{}
  }
  if (affinity_org_id){
    await admin.from('companies').update({ affinity_org_id }).eq('id', companyId);
  }

  const { data: company } = await admin.from('companies').select('id,name,domain,affinity_org_id').eq('id', companyId).single();
  return NextResponse.json({ ok:true, company });
}
