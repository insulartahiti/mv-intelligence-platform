import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Testing direct insert...');
    
    const testCompany = {
      name: 'Test Company',
      domain: 'test.com',
      industry: 'Technology',
      description: 'A test company for debugging',
      affinity_org_id: 999999,
      last_synced_at: new Date().toISOString()
    };
    
    console.log('Inserting test company:', testCompany);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(testCompany)
    });
    
    console.log('Insert response status:', response.status);
    console.log('Insert response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Insert error:', errorText);
      return NextResponse.json({
        success: false,
        error: errorText,
        status: response.status
      });
    }
    
    const result = await response.json();
    console.log('Insert result:', result);
    
    return NextResponse.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Test insert error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
