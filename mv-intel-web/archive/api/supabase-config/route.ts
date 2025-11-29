import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Supabase configuration not found' },
        { status: 500 }
      );
    }
    
    const response = NextResponse.json({
      url: supabaseUrl,
      anonKey: supabaseAnonKey
    });
    
    // Add CORS headers for Chrome extension
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    
    return response;
  } catch (error) {
    console.error('Error providing Supabase config:', error);
    return NextResponse.json(
      { error: 'Failed to provide configuration' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(req: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  
  return response;
}
