import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ success: false, message: 'Code is required' }, { status: 400 });
  }

  try {
    // Fetch entities that have this taxonomy code (prefix match for hierarchy)
    // We assume the taxonomy field stores the code, possibly as a single string.
    // We use ilike for case-insensitive prefix matching.
    const { data, error } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, domain, industry, brief_description, taxonomy, pipeline_stage, enrichment_data')
      .ilike('taxonomy', `${code}%`)
      .order('name');

    if (error) {
      console.error('Error fetching taxonomy entities:', error);
      return NextResponse.json({ success: false, message: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

