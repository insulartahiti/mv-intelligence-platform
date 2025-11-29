import { NextRequest, NextResponse } from 'next/server';

const FUNC_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-affinity-data`;
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const response = await fetch(FUNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mv-signature': WEBHOOK_SECRET
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Affinity sync error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const syncType = searchParams.get('type') || 'all';
    
    const response = await fetch(FUNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mv-signature': WEBHOOK_SECRET
      },
      body: JSON.stringify({ sync_type: syncType })
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Affinity sync error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
