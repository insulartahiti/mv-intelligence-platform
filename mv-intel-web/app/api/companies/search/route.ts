
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    
    const supabase = getSupabaseClient();
    
    let dbQuery = supabase
        .schema('graph')
        .from('entities')
        .select('id, name, domain, type')
        .eq('type', 'organization') // Filter for organizations only
        .limit(20);
        
    if (query.length > 0) {
        dbQuery = dbQuery.ilike('name', `%${query}%`);
    } else {
        // If no query, just return top 20 (maybe sort alphabetically?)
        dbQuery = dbQuery.order('name', { ascending: true });
    }
    
    const { data, error } = await dbQuery;
    
    if (error) {
        throw error;
    }
    
    return NextResponse.json({ companies: data || [] });
    
  } catch (error) {
    console.error('Search companies error:', error);
    return NextResponse.json({ error: 'Failed to search companies' }, { status: 500 });
  }
}

