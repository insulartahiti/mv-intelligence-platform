import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ success: false, message: 'Missing configuration' }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    // Fetch ALL taxonomy codes with pagination (Supabase defaults to 1000 rows)
    const BATCH_SIZE = 1000;
    let allTaxonomies: string[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .schema('graph')
            .from('entities')
            .select('taxonomy')
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        if (error) {
            console.error('Error fetching taxonomy stats:', error);
            if (allTaxonomies.length === 0) {
                return NextResponse.json({ success: false, message: 'Database error' }, { status: 500 });
            }
            break;
        }

        if (data && data.length > 0) {
            // Extract taxonomy values
            data.forEach(row => {
                if (row.taxonomy) {
                    allTaxonomies.push(row.taxonomy);
                }
            });
            
            if (data.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    // Aggregate counts in memory
    // Each entity contributes to all ancestor paths
    // e.g. IFT.PAY.COM.GATEWAY counts for IFT, IFT.PAY, IFT.PAY.COM, IFT.PAY.COM.GATEWAY
    const treeCounts: Record<string, number> = {};
    
    allTaxonomies.forEach(taxonomy => {
        const parts = taxonomy.split('.');
        let path = '';
        for (let i = 0; i < parts.length; i++) {
            path = path ? `${path}.${parts[i]}` : parts[i];
            treeCounts[path] = (treeCounts[path] || 0) + 1;
        }
    });

    return NextResponse.json({ 
        success: true, 
        data: treeCounts,
        meta: {
            totalEntitiesWithTaxonomy: allTaxonomies.length,
            uniqueCodes: Object.keys(treeCounts).length
        }
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
