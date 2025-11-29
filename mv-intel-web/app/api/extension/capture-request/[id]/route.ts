import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json({
        status: 'error',
        message: 'Capture request ID is required'
      }, { status: 400 });
    }

    // Update the capture request
    const { data, error } = await supabase
      .from('capture_requests')
      .update({
        status: body.status,
        result_data: body.result_data || null,
        error_message: body.error_message || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update capture request:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to update capture request',
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: data,
      message: 'Capture request updated successfully'
    });

  } catch (error) {
    console.error('Capture request update error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({
        status: 'error',
        message: 'Capture request ID is required'
      }, { status: 400 });
    }

    // Get the capture request
    const { data, error } = await supabase
      .from('capture_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Failed to get capture request:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to get capture request',
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: data
    });

  } catch (error) {
    console.error('Capture request get error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
