import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const chunkSize = Number(url.searchParams.get('chunkSize') || 1000);
    const offset = Number(url.searchParams.get('offset') || 0);
    const type = url.searchParams.get('type') || 'entities'; // 'entities' or 'edges'

    if (type === 'entities') {
      // Fetch all entities in chunks
      const { data: entities, error, count } = await supabase
        .from('entities_view')
        .select(`
          id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
          is_internal, is_portfolio, is_pipeline, importance, created_at, updated_at
        `, { count: 'exact' })
        .range(offset, offset + chunkSize - 1)
        .order('importance', { ascending: false });

      if (error) throw error;

      return NextResponse.json({
        data: entities || [],
        totalCount: count || 0,
        hasMore: (offset + chunkSize) < (count || 0),
        nextOffset: offset + chunkSize
      });
    } else if (type === 'edges') {
      // Fetch all edges in chunks
      const { data: edges, error, count } = await supabase
        .from('edges_view')
        .select(`
          id, source, target, kind, strength_score, source_type, created_at, updated_at
        `, { count: 'exact' })
        .range(offset, offset + chunkSize - 1)
        .order('strength_score', { ascending: false });

      if (error) throw error;

      return NextResponse.json({
        data: edges || [],
        totalCount: count || 0,
        hasMore: (offset + chunkSize) < (count || 0),
        nextOffset: offset + chunkSize
      });
    } else {
      return NextResponse.json({ error: 'Invalid type. Use "entities" or "edges"' }, { status: 400 });
    }

  } catch (err: any) {
    console.error('/api/graph/full-dataset error', err);
    return NextResponse.json({ error: err.message ?? 'Failed to fetch data' }, { status: 500 });
  }
}

// Get dataset statistics
export async function POST(req: Request) {
  try {
    const { type } = await req.json();

    if (type === 'stats') {
      // Get counts for both entities and edges
      const [entitiesCount, edgesCount] = await Promise.all([
        supabase.from('entities_view').select('*', { count: 'exact', head: true }),
        supabase.from('edges_view').select('*', { count: 'exact', head: true })
      ]);

      return NextResponse.json({
        entitiesCount: entitiesCount.count || 0,
        edgesCount: edgesCount.count || 0,
        lastUpdated: new Date().toISOString()
      });
    }

    return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });

  } catch (err: any) {
    console.error('/api/graph/full-dataset POST error', err);
    return NextResponse.json({ error: err.message ?? 'Failed to get stats' }, { status: 500 });
  }
}
