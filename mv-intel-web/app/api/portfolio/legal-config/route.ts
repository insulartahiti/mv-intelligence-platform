
import { NextRequest, NextResponse } from 'next/server';
import { getLegalConfig, updateLegalConfig, LegalConfigKey } from '@/lib/legal/config';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key') as LegalConfigKey;

  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  }

  const content = await getLegalConfig(key);
  return NextResponse.json({ content });
}

export async function POST(req: NextRequest) {
  try {
    const { key, content, description } = await req.json();

    if (!key || !content) {
      return NextResponse.json({ error: 'Missing key or content' }, { status: 400 });
    }

    const success = await updateLegalConfig(key as LegalConfigKey, content, description);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

