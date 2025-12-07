import { NextRequest, NextResponse } from 'next/server';
import { loadPortcoGuide } from '@/lib/financials/portcos/loader';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get('company');

  if (!company) {
    return NextResponse.json({ error: 'Company slug required' }, { status: 400 });
  }

  try {
    const guide = await loadPortcoGuide(company);
    return NextResponse.json({ guide });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

