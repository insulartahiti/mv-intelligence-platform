import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({ 
      success: true, 
      received: body,
      message: 'POST handler working!'
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to parse body',
      message: String(error)
    }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'GET handler working!' });
}

