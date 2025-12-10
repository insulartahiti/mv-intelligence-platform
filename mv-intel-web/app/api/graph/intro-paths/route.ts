import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

const supabase = createClient(
  'https://uqptiychukuwixubrbat.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg',
  { auth: { persistSession: false } }
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const entityId = url.searchParams.get('entityId');

    if (!entityId) {
      return NextResponse.json({ error: 'Entity ID is required' }, { status: 400 });
    }

    // For now, return a simple response with basic entity info
    // This can be enhanced later with actual intro path logic
    const { data: entity, error } = await supabase
      .from('entities_view')
      .select('id, name, type, domain, industry, pipeline_stage, fund, taxonomy, is_portfolio, is_pipeline, is_internal')
      .eq('id', entityId)
      .single();

    if (error) {
      console.error('Error fetching entity:', error);
      return NextResponse.json({ error: 'Failed to fetch entity' }, { status: 500 });
    }

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // Get connected entities (simplified version)
    const { data: connectedEntities, error: connectedError } = await supabase
      .from('edges_view')
      .select('id, kind, strength_score, source, target')
      .or(`source.eq.${entityId},target.eq.${entityId}`)
      .limit(20);

    if (connectedError) {
      console.error('Error fetching connected entities:', connectedError);
    }

    return NextResponse.json({
      entity,
      connections: connectedEntities || [],
      introPaths: [], // Placeholder for future implementation
    });

  } catch (err: any) {
    console.error('/api/graph/intro-paths error', err);
    return NextResponse.json({ error: err.message ?? 'failed' }, { status: 500 });
  }
}