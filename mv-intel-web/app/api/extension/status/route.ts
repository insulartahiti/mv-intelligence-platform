import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function GET(request: NextRequest) {
  try {
    // Get extension status from Supabase
    const { data: status, error } = await supabase
      .from('extension_status')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Failed to fetch extension status:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch extension status'
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: {
        connected: !!status,
        last_seen: status?.updated_at,
        version: status?.version,
        capabilities: status?.capabilities || []
      }
    });

  } catch (error) {
    console.error('Extension status error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connected, version, capabilities } = body;

    // Update or create extension status
    const { data, error } = await supabase
      .from('extension_status')
      .upsert({
        id: 1, // Single row for extension status
        connected: connected,
        version: version,
        capabilities: capabilities || [],
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to update extension status:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to update extension status'
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: data
    });

  } catch (error) {
    console.error('Extension status update error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
