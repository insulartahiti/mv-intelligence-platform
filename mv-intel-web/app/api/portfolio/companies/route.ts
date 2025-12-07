
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
    const fund = searchParams.get('fund');
    
    const supabase = getSupabaseClient();
    
    let dbQuery = supabase
        .schema('graph')
        .from('entities')
        .select(`
          id, 
          name, 
          domain, 
          industry, 
          fund, 
          location_city, 
          location_country, 
          investment_amount, 
          brief_description,
          logo_url:linkedin_url,
          status:pipeline_stage
        `)
        .eq('type', 'organization')
        .limit(100);
        
    if (query.length > 0) {
        dbQuery = dbQuery.ilike('name', `%${query}%`);
    }
    
    if (fund) {
      dbQuery = dbQuery.eq('fund', fund);
    }
    
    // Order by name
    dbQuery = dbQuery.order('name', { ascending: true });
    
    const { data, error } = await dbQuery;
    
    if (error) {
        console.error('Database error:', error);
        throw error;
    }
    
    // Process data to group by fund if needed, but for now returning flat list
    return NextResponse.json({ companies: data || [] });
    
  } catch (error) {
    console.error('Fetch portfolio companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio companies' }, { status: 500 });
  }
}

