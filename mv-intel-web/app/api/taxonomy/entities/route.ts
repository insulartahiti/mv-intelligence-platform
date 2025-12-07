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
  const search = searchParams.get('search') || '';
  const exact = searchParams.get('exact') === 'true'; // If true, match taxonomy exactly; if false, prefix match
  const page = parseInt(searchParams.get('page') || '0');
  const limit = parseInt(searchParams.get('limit') || '100'); // Default to 100 for better UX

  if (!code && !search) {
    return NextResponse.json({ success: false, message: 'Code or Search query is required' }, { status: 400 });
  }

  try {
    let query = supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, domain, industry, brief_description, taxonomy, pipeline_stage', { count: 'exact' });

    // Apply Taxonomy Filter (if provided)
    if (code) {
        if (exact) {
            // Exact match - only entities classified directly in this category
            query = query.eq('taxonomy', code);
        } else {
            // Prefix match - all entities in this branch (including descendants)
            query = query.ilike('taxonomy', `${code}%`);
        }
    }

    // Apply Search Filter (if provided)
    if (search) {
        // Search in name, description, taxonomy code
        query = query.or(`name.ilike.%${search}%,brief_description.ilike.%${search}%,taxonomy.ilike.%${search}%`);
    }

    const { data, count, error } = await query
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
