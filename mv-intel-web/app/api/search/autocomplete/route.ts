import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const { data, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type')
        .ilike('name', `%${query}%`)
        .limit(5);

    if (error) throw error;

    return NextResponse.json({ results: data });
  } catch (error: any) {
    return NextResponse.json({ results: [], error: error.message }, { status: 500 });
  }
}

