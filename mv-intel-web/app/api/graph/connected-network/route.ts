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
    const maxNodes = Math.min(Number(url.searchParams.get('maxNodes') ?? 50), 200);

    // Get all edges first
    const { data: allEdges, error: edgesError } = await supabase
      .from('edges_view')
      .select('*')
      .limit(1000);
    
    if (edgesError) throw edgesError;
    
    // Get unique entity IDs from edges
    const entityIds = new Set();
    (allEdges || []).forEach(edge => {
      entityIds.add(edge.source);
      entityIds.add(edge.target);
    });
    
    // Get entities that have edges (these will show connections)
    const entityIdsArray = Array.from(entityIds).slice(0, maxNodes);
    const { data: connectedEntities, error: entitiesError } = await supabase
      .from('entities_view')
      .select('*')
      .in('id', entityIdsArray);
    
    if (entitiesError) throw entitiesError;
    
    // Also get some random entities to show disconnected nodes
    const { data: randomEntities, error: randomError } = await supabase
      .from('entities_view')
      .select('*')
      .not('id', 'in', `(${entityIdsArray.join(',')})`)
      .limit(Math.max(0, maxNodes - entityIdsArray.length));
    
    if (randomError) {
      console.warn('Could not fetch random entities:', randomError);
    }
    
    // Combine connected and random entities
    const allEntities = [...(connectedEntities || []), ...(randomEntities || [])];
    
    // Filter edges to only include those between our selected entities
    const selectedEntityIds = new Set(allEntities.map(e => e.id));
    const filteredEdges = (allEdges || []).filter(edge => 
      selectedEntityIds.has(edge.source) && selectedEntityIds.has(edge.target)
    );
    
    // Calculate connection counts for node sizing
    const connectionCounts = new Map();
    filteredEdges.forEach(edge => {
      connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
      connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
    });
    
    // Helper function to clean malformed person names
    const cleanPersonName = (name: string, type: string) => {
      if (type === 'person' && name.includes(';')) {
        // Extract first person's name (before semicolon)
        return name.split(';')[0].trim();
      }
      return name;
    };

    const result = {
      nodes: allEntities.map(entity => ({
        id: entity.id,
        label: cleanPersonName(entity.name, entity.type),
        type: entity.type === 'person' ? 'person' : 'company',
        domain: entity.domain,
        industry: entity.industry,
        pipeline_stage: entity.pipeline_stage,
        fund: entity.fund,
        taxonomy: entity.taxonomy,
        is_internal: entity.is_internal,
        is_portfolio: entity.is_portfolio,
        is_pipeline: entity.is_pipeline,
        size: Math.max(6, Math.min(20, 6 + Math.log(1 + (connectionCounts.get(entity.id) || 0)) * 3))
      })),
      edges: filteredEdges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.kind || "relationship",
        weight: edge.strength_score || 0.5
      }))
    };

    return NextResponse.json(result);

  } catch (err: any) {
    console.error('/api/graph/connected-network error', err);
    return NextResponse.json({ error: err.message ?? 'failed' }, { status: 500 });
  }
}