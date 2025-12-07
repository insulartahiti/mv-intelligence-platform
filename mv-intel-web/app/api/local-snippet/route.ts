import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSnippetPath } from '@/lib/financials/local/storage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get('company');
  const file = searchParams.get('file');

  if (!company || !file) {
    return NextResponse.json({ error: 'Missing company or file' }, { status: 400 });
  }

  const filePath = getSnippetPath(company, file);
  
  if (!filePath) {
    return NextResponse.json({ error: 'Snippet not found' }, { status: 404 });
  }

  try {
    const imageBuffer = fs.readFileSync(filePath);
    
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error) {
    console.error('Error serving snippet:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

