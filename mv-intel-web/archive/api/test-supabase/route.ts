import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Exact same configuration as streaming upload API
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title } = body;
    
    console.log('🧪 Testing Supabase client with exact same config as streaming upload API');
    console.log('📝 Inserting artifact with title:', title);
    
    const { data: artifact, error: artifactError } = await supabase
      .from('artifacts')
      .insert({
        kind: 'presentation',
        title: title || 'Test Artifact',
        description: 'Test description',
        source_url: 'https://test.com',
        source_platform: 'test',
        affinity_deal_id: null,
        affinity_org_id: '1',
        slide_count: 0,
        status: 'CAPTURING',
        metadata: {
          test: true,
          started_at: new Date().toISOString()
        }
      })
      .select()
      .single();
    
    console.log('📝 Insert result:', { artifact, artifactError });
    
    if (artifactError) {
      console.error('❌ Insert error:', artifactError);
      return NextResponse.json({
        status: 'error',
        message: 'Insert failed',
        error: artifactError.message
      }, { status: 500 });
    }
    
    if (!artifact) {
      console.error('❌ No artifact returned');
      return NextResponse.json({
        status: 'error',
        message: 'No artifact returned'
      }, { status: 500 });
    }
    
    console.log('✅ Artifact created:', artifact.id);
    
    // Verify it was actually stored
    const { data: verifyData, error: verifyError } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', artifact.id);
    
    console.log('🔍 Verification result:', { verifyData, verifyError });
    
    return NextResponse.json({
      status: 'success',
      message: 'Test completed',
      data: {
        artifact,
        verification: verifyData
      }
    });
    
  } catch (error) {
    console.error('❌ Test API error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
