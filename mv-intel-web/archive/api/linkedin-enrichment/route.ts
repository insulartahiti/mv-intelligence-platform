import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('http://127.0.0.1:54321', 'http://127.0.0.1:54321') || 'http://127.0.0.1:54321';
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    const { action, contact_id, company_id, limit = 10 } = await request.json();

    console.log(`🚀 LinkedIn enrichment request: ${action}`);

    // Call the LinkedIn enrichment Edge Function
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/linkedin-enrichment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET || ''
      },
      body: JSON.stringify({
        action,
        contact_id,
        company_id,
        limit
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LinkedIn enrichment error:', errorText);
      return NextResponse.json(
        { error: 'LinkedIn enrichment failed', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('LinkedIn enrichment result:', result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in LinkedIn enrichment API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}






