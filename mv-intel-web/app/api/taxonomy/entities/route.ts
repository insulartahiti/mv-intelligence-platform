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

  if (!code) {
    return NextResponse.json({ success: false, message: 'Code is required' }, { status: 400 });
  }

  try {
    // Fetch entities that have this taxonomy code (prefix match for hierarchy)
    // We fetch in batches to bypass the default 1000 row limit of Supabase API
    const BATCH_SIZE = 1000;
    let allData: any[] = [];
    let hasMore = true;
    let page = 0;

    while (hasMore) {
        const { data, error } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, type, domain, industry, brief_description, taxonomy, pipeline_stage')
            .ilike('taxonomy', `${code}%`)
            .order('name')
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        if (error) {
            console.error('Error fetching taxonomy entities:', error);
            // If we have partial data, we could return it, but safer to fail or break
            if (allData.length === 0) {
                 return NextResponse.json({ success: false, message: 'Database error' }, { status: 500 });
            }
            break; 
        }

        if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
        
        // Safety break to prevent infinite loops if DB is huge (cap at 10k for now)
        if (allData.length > 10000) break; 
    }

    return NextResponse.json({ success: true, data: allData });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}

