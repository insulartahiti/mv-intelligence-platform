import { NextRequest, NextResponse } from 'next/server';

const FUNC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/network-query`;
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest){
  const body = await req.json();
  const r = await fetch(FUNC_URL, { method:'POST', headers:{ 'Content-Type':'application/json', 'x-mv-signature': WEBHOOK_SECRET }, body: JSON.stringify(body) });
  const j = await r.json();
  return NextResponse.json(j, { status:r.status });
}
