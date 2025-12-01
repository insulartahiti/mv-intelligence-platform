import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = 'http://127.0.0.1:54321';
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    }
const WEBHOOK_SECRET = 'L26wM7PRBfrTV0VhRkZNnCQ1twb6JQYOpJpQrSu3Ikc';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entity_type, limit, regenerate } = body;

    console.log(`🚀 Generate investment embeddings request: ${entity_type}`);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-investment-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        entity_type: entity_type || 'all',
        limit: limit || 100,
        regenerate: regenerate || false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Generate investment embeddings error:', data);
      return NextResponse.json(
        { error: data.error || 'Generate investment embeddings failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Generate investment embeddings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
