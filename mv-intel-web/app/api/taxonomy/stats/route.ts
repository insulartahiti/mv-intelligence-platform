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
    // Fetch all taxonomy codes for counting
    // Using .csv() might be lighter or just regular select with minimal columns
    // We only need the taxonomy column
    const { data, error } = await supabase
        .schema('graph')
        .from('entities')
        .select('taxonomy');

    if (error) {
        console.error('Error fetching taxonomy stats:', error);
        return NextResponse.json({ success: false, message: 'Database error' }, { status: 500 });
    }

    if (!data) return NextResponse.json({ success: true, data: {} });

    // Aggregate counts in memory (fast enough for <50k rows)
    // We need to count not just the leaf, but bubble up the counts to parents
    // e.g. IFT.PAY.COM.GATEWAY counts for itself, IFT.PAY.COM, IFT.PAY, and IFT
    
    const counts: Record<string, number> = {};

    data.forEach(row => {
        if (!row.taxonomy) return;
        
        const code = row.taxonomy;
        // Count the exact match
        counts[code] = (counts[code] || 0) + 1;

        // Count all parents
        const parts = code.split('.');
        let currentPath = parts[0];
        
        // Ensure root is counted if it matches first part (usually 'IFT')
        // (Though if row.taxonomy is 'IFT.PAY', parts[0] is 'IFT')
        // We iterate to build cumulative paths
        
        // Wait, simpler logic:
        // 'IFT.PAY.COM' -> increment 'IFT', 'IFT.PAY', 'IFT.PAY.COM'
        
        let pathAccumulator = '';
        for (let i = 0; i < parts.length; i++) {
            if (i === 0) {
                pathAccumulator = parts[0];
            } else {
                pathAccumulator += '.' + parts[i];
            }
            
            // Avoid double counting exact match if we did it above? 
            // Actually, best to just do the loop.
            // If code is 'A.B', loop produces 'A', 'A.B'.
            
            // If we didn't do the exact match outside loop:
            // For 'A.B', we increment 'A', then 'A.B'.
            // This correctly counts 'A.B' as being inside 'A'.
            // And 'A.B' count includes itself.
            
            // But wait: if we have 2 entities:
            // 1. IFT.PAY
            // 2. IFT.PAY.COM
            
            // Entity 1 adds to IFT, IFT.PAY
            // Entity 2 adds to IFT, IFT.PAY, IFT.PAY.COM
            
            // Result: IFT=2, IFT.PAY=2, IFT.PAY.COM=1
            // This is correct behavior for "Total entities in this branch".
            
            // However, we need to be careful not to double count if we already initialized outside loop.
            // Let's remove the "Count the exact match" line above and rely strictly on the loop.
        }
    });
    
    // Correct loop implementation
    const treeCounts: Record<string, number> = {};
    
    data.forEach(row => {
        if (!row.taxonomy) return;
        const parts = row.taxonomy.split('.');
        let path = '';
        for (let i = 0; i < parts.length; i++) {
            path = path ? `${path}.${parts[i]}` : parts[i];
            treeCounts[path] = (treeCounts[path] || 0) + 1;
        }
    });

    return NextResponse.json({ success: true, data: treeCounts });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
