import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const WEBHOOK_SECRET = process.env.MV_WEBHOOK_SECRET || 'L26wM7PRBfrTV0VhRkZNnCQ1twb6JQYOpJpQrSu3Ikc';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      list_name = 'Motive Ventures Pipeline', 
      limit = 10,
      generate_embeddings = true,
      generate_intelligence = true
    } = body;

    console.log(`🔄 Starting enhanced sync for list: "${list_name}"`);
    console.log(`📡 Calling Edge Function at: ${SUPABASE_URL}/functions/v1/enhanced-sync-pipeline`);
    console.log(`🔑 Using service role key: ${SERVICE_ROLE_KEY.substring(0, 20)}...`);
    console.log(`🔐 Using webhook secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);

    // Call the Edge Function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/enhanced-sync-pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET
      },
      body: JSON.stringify({
        list_name,
        limit,
        generate_embeddings,
        generate_intelligence
      })
    });

    console.log('Edge Function response status:', response.status);
    console.log('Edge Function response ok:', response.ok);
    
    const result = await response.json();
    console.log('Edge Function result:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      return NextResponse.json({
        status: 'error',
        message: 'Enhanced sync failed',
        error: result.error || 'Unknown error',
        debug: {
          responseStatus: response.status,
          responseOk: response.ok
        }
      }, { status: response.status });
    }

    return NextResponse.json({
      status: 'success',
      message: `Successfully synced ${list_name} with embeddings and intelligence`,
      data: result,
      debug: {
        responseStatus: response.status,
        responseOk: response.ok
      }
    });

  } catch (error) {
    console.error('Enhanced sync error:', error);
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
    message: 'Use POST to trigger enhanced sync',
    usage: {
      method: 'POST',
      body: {
        list_name: 'string (default: "Motive Ventures Pipeline")',
        limit: 'number (default: 10)',
        generate_embeddings: 'boolean (default: true)',
        generate_intelligence: 'boolean (default: true)'
      }
    }
  });
}


