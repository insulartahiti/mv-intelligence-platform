import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
    }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, title, organization_id, deal_id, user_id } = body;

    if (!url) {
      return NextResponse.json({
        status: 'error',
        message: 'URL is required'
      }, { status: 400 });
    }

    // Create capture request in Supabase
    const { data: captureRequest, error } = await supabase
      .from('capture_requests')
      .insert({
        url: url,
        title: title || 'Untitled Capture',
        organization_id: organization_id,
        deal_id: deal_id,
        user_id: user_id || 'anonymous',
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create capture request:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to create capture request'
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: captureRequest,
      message: 'Capture request created successfully'
    });

  } catch (error) {
    console.error('Capture request error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';

    // Get pending capture requests
    const { data: requests, error } = await supabase
      .from('capture_requests')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch capture requests:', error);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch capture requests'
      }, { status: 500 });
    }

    return NextResponse.json({
      status: 'success',
      data: requests || []
    });

  } catch (error) {
    console.error('Capture requests fetch error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
