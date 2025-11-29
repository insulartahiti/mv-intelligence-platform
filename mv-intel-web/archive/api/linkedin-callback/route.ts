import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    if (error) {
      console.error('LinkedIn OAuth error:', error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/knowledge-graph?error=oauth_failed&message=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      console.error('No authorization code received');
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/knowledge-graph?error=no_code`
      );
    }

    // Redirect back to knowledge graph with the code
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/knowledge-graph?linkedin_code=${code}&state=${state || ''}`
    );

  } catch (error) {
    console.error('LinkedIn callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/knowledge-graph?error=callback_failed`
    );
  }
}
