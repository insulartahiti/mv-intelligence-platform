import { NextRequest, NextResponse } from 'next/server';

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

export async function GET(request: NextRequest) {
  try {
    console.log('AFFINITY_API_KEY available:', !!AFFINITY_API_KEY);
    console.log('AFFINITY_API_KEY length:', AFFINITY_API_KEY?.length || 0);
    console.log('AFFINITY_API_KEY first 10 chars:', AFFINITY_API_KEY?.substring(0, 10) || 'N/A');
    
    if (!AFFINITY_API_KEY) {
      return NextResponse.json({
        status: 'error',
        message: 'Affinity API key not configured'
      }, { status: 500 });
    }

    // Test the Affinity API directly
    const response = await fetch(`${AFFINITY_BASE_URL}/lists`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Affinity API response status:', response.status);
    console.log('Affinity API response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Affinity API error response:', errorText);
      return NextResponse.json({
        status: 'error',
        message: `Affinity API error: ${response.status} ${response.statusText}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    console.log('Affinity API success, lists count:', data.length);

    return NextResponse.json({
      status: 'success',
      message: 'Affinity API test successful',
      data: {
        lists_count: data.length,
        first_few_lists: data.slice(0, 20).map((list: any) => ({
          id: list.id,
          name: list.name,
          type: list.type,
          list_size: list.list_size
        }))
      }
    });

  } catch (error) {
    console.error('Test Affinity API error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
