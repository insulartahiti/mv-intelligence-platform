import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuration - Use local Supabase for development
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test 1: Check if we can connect to Supabase
    const { data: testData, error: testError } = await supabase
      .from('artifacts')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection error:', testError);
      return NextResponse.json({
        status: 'error',
        message: 'Database connection failed',
        error: testError.message
      }, { status: 500 });
    }
    
    console.log('✅ Database connection successful');
    
    // Test 2: Try to insert a test artifact
    const testArtifact = {
      kind: 'presentation',
      title: 'Debug Test Artifact',
      description: 'Testing database insertion',
      source_platform: 'debug',
      affinity_org_id: '1',
      status: 'CAPTURING'
    };
    
    console.log('📝 Inserting test artifact...');
    const { data: insertData, error: insertError } = await supabase
      .from('artifacts')
      .insert(testArtifact)
      .select();
    
    if (insertError) {
      console.error('❌ Insert error:', insertError);
      return NextResponse.json({
        status: 'error',
        message: 'Insert failed',
        error: insertError.message
      }, { status: 500 });
    }
    
    console.log('✅ Insert successful:', insertData);
    
    // Test 3: Try to query the inserted artifact
    const { data: queryData, error: queryError } = await supabase
      .from('artifacts')
      .select('*')
      .eq('id', insertData[0].id);
    
    if (queryError) {
      console.error('❌ Query error:', queryError);
      return NextResponse.json({
        status: 'error',
        message: 'Query failed',
        error: queryError.message
      }, { status: 500 });
    }
    
    console.log('✅ Query successful:', queryData);
    
    return NextResponse.json({
      status: 'success',
      message: 'Database connection and operations working',
      data: {
        connection: 'OK',
        insert: insertData,
        query: queryData
      }
    });
    
  } catch (error) {
    console.error('❌ Debug API error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
