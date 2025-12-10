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
    const mode = url.searchParams.get('mode') || 'hubs'; // 'hubs', 'business', 'subgraph', 'search'
    const nodeId = url.searchParams.get('nodeId');
    const searchTerm = url.searchParams.get('search');
    const focusType = url.searchParams.get('focusType') || 'all';
    const maxNodes = Math.min(Number(url.searchParams.get('maxNodes') ?? 300), 1000);

    let result;

    switch (mode) {
      case 'hubs':
        // Get entities that actually have connections
        const { data: allEdges, error: edgesError } = await supabase
          .from('edges_view')
          .select('source,target');
        
        if (edgesError) throw edgesError;
        
        // Get unique entity IDs that have connections
        const connectedEntityIds = new Set();
        (allEdges || []).forEach(edge => {
          connectedEntityIds.add(edge.source);
          connectedEntityIds.add(edge.target);
        });
        
        // Get entities that have connections
        const { data: connectedEntities, error: entitiesError } = await supabase
          .from('entities_view')
          .select('*')
          .limit(maxNodes);
        
        if (entitiesError) throw entitiesError;
        
        // Filter to only entities that have connections
        const connectedIds = Array.from(connectedEntityIds);
        const filteredEntities = (connectedEntities || []).filter(entity => 
          connectedIds.includes(entity.id)
        );
        
        // Calculate connection counts
        const entityConnections = new Map();
        (allEdges || []).forEach(edge => {
          entityConnections.set(edge.source, (entityConnections.get(edge.source) || 0) + 1);
          entityConnections.set(edge.target, (entityConnections.get(edge.target) || 0) + 1);
        });
        
        // Sort by importance (connections + business value)
        const sortedEntities = filteredEntities.map(entity => ({
          ...entity,
          connection_count: entityConnections.get(entity.id) || 0,
          importance_score: (entityConnections.get(entity.id) || 0) * 
            (entity.is_portfolio ? 3.0 : entity.is_pipeline ? 2.0 : entity.is_internal ? 1.5 : 1.0)
        })).sort((a, b) => b.importance_score - a.importance_score).slice(0, maxNodes);
        
        // Get edges between these entities
        const hubIds = sortedEntities.map(e => e.id);
        const { data: hubEdges, error: hubEdgesError } = await supabase
          .from('edges_view')
          .select('*')
          .in('source', hubIds);
        
        if (hubEdgesError) throw hubEdgesError;
        
        // Filter edges to only include those where both source and target are in our node set
        const filteredEdges = (hubEdges || []).filter(edge => 
          hubIds.includes(edge.source) && hubIds.includes(edge.target)
        );
        
        result = {
          nodes: sortedEntities.map(h => ({
            id: h.id,
            label: h.name,
            type: h.type === 'person' ? 'person' : 'company',
            domain: h.domain,
            industry: h.industry,
            pipeline_stage: h.pipeline_stage,
            fund: h.fund,
            taxonomy: h.taxonomy,
            is_internal: h.is_internal,
            is_portfolio: h.is_portfolio,
            is_pipeline: h.is_pipeline,
            size: Math.max(6, Math.min(20, 6 + Math.log(1 + h.connection_count) * 3)),
            connection_count: h.connection_count,
            importance_score: h.importance_score
          })),
          edges: filteredEdges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            kind: e.kind || "relationship",
            weight: e.strength_score || 0.5
          }))
        };
        break;

      case 'business':
        // Get business-focused entities
        const { data: businessEntities, error: businessError } = await supabase
          .from('entities_view')
          .select('*')
          .or(`is_portfolio.eq.true,is_pipeline.eq.true,is_internal.eq.true`)
          .order('is_portfolio', { ascending: false })
          .order('is_pipeline', { ascending: false })
          .order('is_internal', { ascending: false })
          .limit(maxNodes);
        
        if (businessError) throw businessError;
        
        const businessIds = businessEntities.map(e => e.id);
        const { data: businessEdges, error: businessEdgesError } = await supabase
          .from('edges_view')
          .select('*')
          .in('source', businessIds);
        
        if (businessEdgesError) throw businessEdgesError;
        
        // Filter edges to only include those where both source and target are in our node set
        const filteredBusinessEdges = (businessEdges || []).filter(edge => 
          businessIds.includes(edge.source) && businessIds.includes(edge.target)
        );
        
        result = {
          nodes: businessEntities.map(e => ({
            id: e.id,
            label: e.name,
            type: e.type === 'person' ? 'person' : 'company',
            domain: e.domain,
            industry: e.industry,
            pipeline_stage: e.pipeline_stage,
            fund: e.fund,
            taxonomy: e.taxonomy,
            is_internal: e.is_internal,
            is_portfolio: e.is_portfolio,
            is_pipeline: e.is_pipeline
          })),
          edges: filteredBusinessEdges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            kind: e.kind || "relationship",
            weight: e.strength_score || 0.5
          }))
        };
        break;

      case 'search':
        // Simple text search
        if (!searchTerm) {
          return NextResponse.json({ error: 'search term is required for search mode' }, { status: 400 });
        }
        
        const { data: searchEntities, error: searchError } = await supabase
          .from('entities_view')
          .select('*')
          .or(`name.ilike.%${searchTerm}%,domain.ilike.%${searchTerm}%,industry.ilike.%${searchTerm}%`)
          .limit(20);
        
        if (searchError) throw searchError;
        
        const searchIds = searchEntities.map(e => e.id);
        const { data: searchEdges, error: searchEdgesError } = await supabase
          .from('edges_view')
          .select('*')
          .in('source', searchIds);
        
        if (searchEdgesError) throw searchEdgesError;
        
        // Filter edges to only include those where both source and target are in our node set
        const filteredSearchEdges = (searchEdges || []).filter(edge => 
          searchIds.includes(edge.source) && searchIds.includes(edge.target)
        );
        
        result = {
          nodes: searchEntities.map(e => ({
            id: e.id,
            label: e.name,
            type: e.type === 'person' ? 'person' : 'company',
            domain: e.domain,
            industry: e.industry,
            pipeline_stage: e.pipeline_stage,
            fund: e.fund,
            taxonomy: e.taxonomy,
            is_internal: e.is_internal,
            is_portfolio: e.is_portfolio,
            is_pipeline: e.is_pipeline
          })),
          edges: filteredSearchEdges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            kind: e.kind || "relationship",
            weight: e.strength_score || 0.5
          })),
          searchResults: searchEntities.map(e => ({
            id: e.id,
            name: e.name,
            type: e.type
          }))
        };
        break;

      default:
        return NextResponse.json({ error: 'Invalid mode. Use: hubs, business, or search' }, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (err: any) {
    console.error('/api/graph/smart-network error', err);
    return NextResponse.json({ error: err.message ?? 'failed' }, { status: 500 });
  }
}
