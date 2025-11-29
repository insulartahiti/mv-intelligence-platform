import { NextRequest, NextResponse } from 'next/server';

// Configuration
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

export async function GET(request: NextRequest) {
  try {
    console.log('AFFINITY_API_KEY available:', !!AFFINITY_API_KEY);
    console.log('AFFINITY_API_KEY length:', AFFINITY_API_KEY?.length || 0);
    
    if (!AFFINITY_API_KEY) {
      return NextResponse.json({
        status: 'error',
        message: 'Affinity API key not configured'
      }, { status: 500 });
    }

    try {
      // Get lists from Affinity
      const response = await fetch(`${AFFINITY_BASE_URL}/lists`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Affinity API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Format the lists data - the API returns an array directly, not an object with lists property
      const formattedLists = data?.map((list: any) => ({
        id: list.id,
        name: list.name,
        type: list.type,
        description: list.description,
        organization_count: list.list_size || 0,
        created_at: list.created_at
      })) || [];

      return NextResponse.json({
        status: 'success',
        data: formattedLists
      });

    } catch (affinityError) {
      console.error('Failed to fetch lists:', affinityError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to fetch lists',
        details: affinityError instanceof Error ? affinityError.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Lists fetch error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
