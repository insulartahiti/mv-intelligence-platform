import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing Supabase configuration');
    }

    const body = await request.json();
    const { query, include_warm_introductions, target_contact_id } = body;

    console.log(`🚀 Universal search request: "${query}"`);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/universal-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({
        query,
        include_warm_introductions: include_warm_introductions || false,
        target_contact_id: target_contact_id || null
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Universal search error:', data);
      return NextResponse.json(
        { error: data.error || 'Universal search failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Universal search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
