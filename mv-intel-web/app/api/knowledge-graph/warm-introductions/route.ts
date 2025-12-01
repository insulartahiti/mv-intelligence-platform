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
    const { action, target_contact_id, max_path_length, min_strength } = body;

    console.log(`🚀 Warm introductions API request: ${action}`);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/warm-introductions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        action,
        target_contact_id,
        max_path_length: max_path_length || 3,
        min_strength: min_strength || 0.3
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Edge Function error:', data);
      return NextResponse.json(
        { error: data.error || 'Warm introductions request failed' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Warm introductions API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
