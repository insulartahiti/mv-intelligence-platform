import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = 'http://127.0.0.1:54321'; // Force local Supabase for development
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || 'L26wM7PRBfrTV0VhRkZNnCQ1twb6JQYOpJpQrSu3Ikc';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'; // Local Supabase service role key

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entity_type = 'all', limit = 50, force_regenerate = false } = body;

    console.log(`🔄 Generating embeddings for: ${entity_type}, limit: ${limit}`);

    // Call the Edge Function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET
      },
      body: JSON.stringify({
        entity_type,
        limit,
        force_regenerate
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        status: 'error',
        message: 'Failed to generate embeddings',
        error: result.error || 'Unknown error'
      }, { status: response.status });
    }

    return NextResponse.json({
      status: 'success',
      message: `Successfully generated embeddings for ${result.results ? Object.values(result.results).reduce((sum: number, r: any) => sum + (r.processed || 0), 0) : 0} entities`,
      data: result
    });

  } catch (error) {
    console.error('Embedding generation error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'info',
    message: 'Use POST to generate embeddings',
    usage: {
      method: 'POST',
      body: {
        entity_type: 'all | companies | contacts | interactions',
        limit: 'number (default: 50)',
        force_regenerate: 'boolean (default: false)'
      }
    }
  });
}


