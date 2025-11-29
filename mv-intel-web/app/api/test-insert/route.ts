import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Testing entity insert...');
    
    // Test inserting a simple entity
    const testEntity = {
      id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
      name: 'Test Company',
      type: 'organization',
      domain: 'test.com',
      source: 'test_import',
      metadata: { test: true }
    };
    
    console.log('Inserting test entity:', testEntity);
    
    const { data, error } = await supabase
      .schema('graph')
      .from('entities')
      .upsert([testEntity], { onConflict: 'id' });
    
    if (error) {
      console.error('Insert error:', error);
      return NextResponse.json({
        success: false,
        error: `Insert failed: ${error.message}`,
        details: error
      });
    }
    
    console.log('Insert successful:', data);
    
    return NextResponse.json({
      success: true,
      message: 'Test entity inserted successfully',
      data: data
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    }, { status: 500 });
  }
}
