import { NextRequest, NextResponse } from 'next/server';

// Configuration
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

interface AddToListRequest {
  organization_id: number;
  list_id: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: AddToListRequest = await request.json();
    const { organization_id, list_id } = body;

    if (!organization_id || !list_id) {
      return NextResponse.json({
        status: 'error',
        message: 'Organization ID and List ID are required'
      }, { status: 400 });
    }

    if (!AFFINITY_API_KEY) {
      return NextResponse.json({
        status: 'error',
        message: 'Affinity API key not configured'
      }, { status: 500 });
    }

    try {
      // Add organization to list in Affinity
      const response = await fetch(`${AFFINITY_BASE_URL}/lists/${list_id}/organizations`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(':' + AFFINITY_API_KEY).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          organization_id: organization_id
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Affinity API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      return NextResponse.json({
        status: 'success',
        message: 'Organization added to list successfully',
        data: data
      });

    } catch (affinityError) {
      console.error('Failed to add organization to list:', affinityError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to add organization to list',
        details: affinityError instanceof Error ? affinityError.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Add to list error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
