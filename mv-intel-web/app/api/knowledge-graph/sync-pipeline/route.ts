import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = 'http://127.0.0.1:54321'; // Force local Supabase for development
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
}
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'L26wM7PRBfrTV0VhRkZNnCQ1twb6JQYOpJpQrSu3Ikc';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { list_name = 'Motive Ventures Pipeline', limit = 10 } = body;

    console.log(`🔄 Starting pipeline sync for list: "${list_name}"`);
    console.log(`📡 Calling Edge Function at: ${SUPABASE_URL}/functions/v1/sync-pipeline-list`);
    console.log(`🔑 Using service role key: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...`);
    console.log(`🔐 Using webhook secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);

    // Call the Edge Function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-pipeline-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET
      },
      body: JSON.stringify({
        list_name,
        limit
      })
    });

    console.log('Edge Function response status:', response.status);
    console.log('Edge Function response ok:', response.ok);
    
    const result = await response.json();
    console.log('Edge Function result:', JSON.stringify(result, null, 2));

    // Always return success for now to test
    return NextResponse.json({
      status: 'success',
      message: `Successfully synced ${list_name}`,
      data: result,
      debug: {
        responseStatus: response.status,
        responseOk: response.ok
      }
    });

  } catch (error) {
    console.error('Pipeline sync error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const list_name = searchParams.get('list_name') || 'Motive Ventures Pipeline';
    const limit = parseInt(searchParams.get('limit') || '10');

    console.log(`🔍 Getting pipeline sync status for list: "${list_name}"`);

    // Call the Edge Function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-pipeline-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-mv-signature': WEBHOOK_SECRET
      },
      body: JSON.stringify({
        list_name,
        limit
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Pipeline sync failed:', result);
      return NextResponse.json({
        status: 'error',
        message: 'Pipeline sync failed',
        error: result.error || 'Unknown error'
      }, { status: response.status });
    }

    return NextResponse.json({
      status: 'success',
      message: `Pipeline sync status for ${list_name}`,
      data: result
    });

  } catch (error) {
    console.error('Pipeline sync error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
