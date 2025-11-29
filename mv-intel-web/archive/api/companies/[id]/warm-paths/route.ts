import { NextRequest, NextResponse } from 'next/server';

const FUNC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/warm-paths-for-company`;
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest, { params }: { params: { id: string } }){
  const body = await req.json();
  const payload = { ...body, companyId: params.id };
  const r = await fetch(FUNC_URL, { method:'POST', headers:{ 'Content-Type':'application/json', 'x-mv-signature': WEBHOOK_SECRET }, body: JSON.stringify(payload) });
  const j = await r.json();
  return NextResponse.json(j, { status: r.status });
}
