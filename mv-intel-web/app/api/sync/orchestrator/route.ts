import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobType } = body;

    console.log(`Sync orchestrator action: ${action}${jobType ? ` (${jobType})` : ''}`);

    // Call the Supabase Edge Function
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, jobType })
    });

    if (!response.ok) {
      throw new Error(`Sync orchestrator failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    console.log('Sync orchestrator result:', result);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      results: result.results || [],
      result: result.result || null
    });

  } catch (error) {
    console.error('Error calling sync orchestrator:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to call sync orchestrator: ${error instanceof Error ? error.message : 'Unknown error'}`,
        results: []
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get sync orchestrator status
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-orchestrator`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get sync status: ${response.status}`);
    }

    const result = await response.json();
    
    return NextResponse.json({
      success: result.success,
      status: result.status
    });

  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to get sync status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: null
      },
      { status: 500 }
    );
  }
}
