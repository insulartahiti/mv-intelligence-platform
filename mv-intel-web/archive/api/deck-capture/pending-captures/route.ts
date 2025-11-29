import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuration - Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function GET(request: NextRequest) {
  try {
    // Get artifacts that are currently being processed
    const { data: pendingArtifacts, error } = await supabase
      .from('artifacts')
      .select('*')
      .in('status', ['CAPTURING', 'PROCESSING'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Failed to fetch pending captures:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch pending captures'
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: pendingArtifacts || []
    });

  } catch (error) {
    console.error('Pending captures API error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
