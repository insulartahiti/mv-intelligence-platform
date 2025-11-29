import { NextRequest, NextResponse } from 'next/server';

const FUNC_URL = 'http://127.0.0.1:54321/functions/v1/hybrid-search'; // Force local Supabase for development
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || 'L26wM7PRBfrTV0VhRkZNnCQ1twb6JQYOpJpQrSu3Ikc';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'; // Local Supabase service role key

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const response = await fetch(FUNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Knowledge graph search error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
