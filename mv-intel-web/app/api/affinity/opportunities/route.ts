import { NextRequest, NextResponse } from 'next/server';

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = process.env.AFFINITY_BASE_URL || 'https://api.affinity.co';

function basicAuthHeaders(): Record<string, string> {
  if(!AFFINITY_API_KEY) return {};
  const token = Buffer.from(':'+AFFINITY_API_KEY).toString('base64');
  return { Authorization: `Basic ${token}` };
}

export async function GET(req: NextRequest){
  const affOrgId = req.nextUrl.searchParams.get('affOrgId');
  if (!AFFINITY_API_KEY) return NextResponse.json({ opportunities: [] });
  if (!affOrgId) return NextResponse.json({ opportunities: [] });

  try{
    const url = new URL(`${AFFINITY_BASE_URL}/opportunities`);
    url.searchParams.set('organization_id', affOrgId);
    const r = await fetch(url.toString(), { headers: { ...basicAuthHeaders() } });
    if (!r.ok) return NextResponse.json({ opportunities: [] });
    const j = await r.json();
    const arr = Array.isArray(j.opportunities) ? j.opportunities : (j.opportunities ?? j);
    const mapped = Array.isArray(arr) ? arr.map((o:any)=>({ id:o.id, name:o.name, stage:o?.opportunity_stage?.name || o?.stage?.name || null })) : [];
    return NextResponse.json({ opportunities: mapped });
  }catch{
    return NextResponse.json({ opportunities: [] });
  }
}
