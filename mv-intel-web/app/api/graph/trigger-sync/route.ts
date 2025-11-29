import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('Triggering Affinity sync...');
    
    // Call the Supabase Edge Function
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/affinity-full-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Sync function failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    console.log('Sync result:', result);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      stats: result.stats
    });

  } catch (error) {
    console.error('Error triggering sync:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to trigger sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stats: {}
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current sync state using the graph schema
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sync_state?select=*`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        'Content-Type': 'application/json',
        'Accept-Profile': 'graph'
      },
    });

    if (!response.ok) {
      // If sync_state doesn't exist, return default state
      return NextResponse.json({
        success: true,
        syncState: {
          last_sync_timestamp: null,
          entities_synced: 0,
          rate_limit_remaining: 300,
          next_sync_allowed: new Date().toISOString(),
          current_batch: 0,
          total_batches: 0
        }
      });
    }

    const data = await response.json();
    const syncState = data[0] || null;

    return NextResponse.json({
      success: true,
      syncState
    });

  } catch (error) {
    console.error('Error fetching sync state:', error);
    return NextResponse.json(
      {
        success: true,
        syncState: {
          last_sync_timestamp: null,
          entities_synced: 0,
          rate_limit_remaining: 300,
          next_sync_allowed: new Date().toISOString(),
          current_batch: 0,
          total_batches: 0
        }
      }
    );
  }
}
