import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function GET(request: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ success: false, message: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const page = parseInt(searchParams.get('page') || '0');
  const limit = parseInt(searchParams.get('limit') || '1000'); // Default batch size, can be overridden but max 1000 per request from client

  if (!code) {
    return NextResponse.json({ success: false, message: 'Code is required' }, { status: 400 });
  }

  try {
    // Fetch entities that have this taxonomy code (prefix match for hierarchy)
    const { data, count, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, domain, industry, brief_description, taxonomy, pipeline_stage', { count: 'exact' })
        .ilike('taxonomy', `${code}%`)
        .order('name')
        .range(page * limit, (page + 1) * limit - 1);

    if (error) {
        console.error('Error fetching taxonomy entities:', error);
        return NextResponse.json({ success: false, message: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ 
        success: true, 
        data: data || [], 
        pagination: {
            total: count || 0,
            page: page,
            limit: limit,
            hasMore: (count || 0) > (page + 1) * limit
        }
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
