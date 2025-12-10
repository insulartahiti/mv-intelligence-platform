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
    const mode = url.searchParams.get('mode') || 'hubs';
    const maxNodes = Math.min(Number(url.searchParams.get('maxNodes') ?? 50), 200);
    const expandNodeId = url.searchParams.get('expandNodeId');
    const currentNodes = url.searchParams.get('currentNodes')?.split(',') || [];

    console.log(`Progressive loading: mode=${mode}, maxNodes=${maxNodes}, expandNodeId=${expandNodeId}`);

    let result;

    if (expandNodeId) {
      // Expand around a specific node
      result = await expandAroundNode(expandNodeId, currentNodes, maxNodes);
    } else {
      // Initial load based on mode
      result = await loadInitialGraph(mode, maxNodes);
    }

    return NextResponse.json(result);

  } catch (err: any) {
    console.error('/api/graph/progressive-network error', err);
    return NextResponse.json({ error: err.message ?? 'failed' }, { status: 500 });
  }
}

async function loadInitialGraph(mode: string, maxNodes: number) {
  let entities;
  
  switch (mode) {
    case 'hubs':
      // Load most connected entities (business hubs)
      entities = await loadHubEntities(maxNodes);
      break;
    case 'business':
      // Load portfolio/pipeline entities
      entities = await loadBusinessEntities(maxNodes);
      break;
    case 'diligence':
      // Load companies in due diligence stage
      entities = await loadDiligenceEntities(maxNodes);
      break;
    case 'search':
      // Load entities with high importance scores
      entities = await loadImportantEntities(maxNodes);
      break;
    default:
      entities = await loadDiligenceEntities(maxNodes);
  }

  // Get edges for these entities
  const edges = await getEdgesForEntities(entities.map(e => e.id));
  
  const totalAvailable = await getTotalEntityCount();
  return {
    nodes: formatNodes(entities, edges),
    edges: formatEdges(edges),
    hasMore: entities.length < totalAvailable,
    totalAvailable: totalAvailable
  };
}

async function expandAroundNode(nodeId: string, currentNodes: string[], maxNodes: number) {
  // Get 2-hop neighborhood of the node
  const { data: directEdges, error: directError } = await supabase
    .from('edges_view')
    .select('source, target, kind, strength_score')
    .or(`source.eq.${nodeId},target.eq.${nodeId}`)
    .limit(200);

  if (directError) throw directError;

  // Get connected node IDs
  const connectedIds = new Set<string>();
  (directEdges || []).forEach(edge => {
    if (edge.source !== nodeId) connectedIds.add(edge.source);
    if (edge.target !== nodeId) connectedIds.add(edge.target);
  });

  // Get 2-hop connections
  const connectedIdsArray = Array.from(connectedIds);
  if (connectedIdsArray.length > 0) {
    const { data: secondHopEdges, error: secondError } = await supabase
      .from('edges_view')
      .select('source, target, kind, strength_score')
      .in('source', connectedIdsArray)
      .limit(300);

    if (!secondError && secondHopEdges) {
      secondHopEdges.forEach(edge => {
        if (!connectedIds.has(edge.source)) connectedIds.add(edge.source);
        if (!connectedIds.has(edge.target)) connectedIds.add(edge.target);
      });
    }
  }

  // Filter out already loaded nodes
  const newIds = Array.from(connectedIds).filter(id => !currentNodes.includes(id));
  
  // Limit to maxNodes
  const idsToLoad = newIds.slice(0, maxNodes);
  
  if (idsToLoad.length === 0) {
    return {
      nodes: [],
      edges: [],
      hasMore: false,
      totalAvailable: 0
    };
  }

  // Load entities
  const { data: entities, error: entitiesError } = await supabase
    .from('entities_view')
    .select('*')
    .in('id', idsToLoad);

  if (entitiesError) throw entitiesError;

  // Get edges for these new entities
  const edges = await getEdgesForEntities(idsToLoad);
  
  return {
    nodes: formatNodes(entities || [], edges),
    edges: formatEdges(edges),
    hasMore: newIds.length > maxNodes,
    totalAvailable: newIds.length
  };
}

async function loadHubEntities(maxNodes: number) {
  // Load entities with most connections
  const { data: entities, error } = await supabase
    .from('entities_view')
    .select(`
      id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
      is_internal, is_portfolio, is_pipeline, importance
    `)
    .not('importance', 'is', null)
    .order('importance', { ascending: false })
    .limit(Math.min(maxNodes, 100)); // Increased limit for better data loading

  if (error) throw error;

  if (!entities || entities.length === 0) {
    return [];
  }

  // Get connected entities
  const entityIds = entities.map(e => e.id);
  const { data: connectedEdges, error: edgesError } = await supabase
    .from('edges_view')
    .select('source, target, kind, strength_score')
    .or(`source.in.(${entityIds.join(',')}),target.in.(${entityIds.join(',')})`)
    .limit(2000);

  if (edgesError) {
    console.warn('Error fetching connected edges:', edgesError);
    return entities;
  }

  // Get unique connected entity IDs
  const connectedIds = new Set<string>();
  (connectedEdges || []).forEach(edge => {
    if (!entityIds.includes(edge.source)) connectedIds.add(edge.source);
    if (!entityIds.includes(edge.target)) connectedIds.add(edge.target);
  });

  // Load connected entities
  const connectedIdsArray = Array.from(connectedIds).slice(0, Math.min(connectedIds.size, maxNodes * 2));
  let connectedEntities: any[] = [];
  
  if (connectedIdsArray.length > 0) {
    const { data: connectedData, error: connectedError } = await supabase
      .from('entities_view')
      .select(`
        id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
        is_internal, is_portfolio, is_pipeline, importance
      `)
      .in('id', connectedIdsArray);

    if (connectedError) {
      console.warn('Error fetching connected entities:', connectedError);
    } else {
      connectedEntities = connectedData || [];
    }
  }

  return [...entities, ...connectedEntities];
}

async function loadBusinessEntities(maxNodes: number) {
  // Load portfolio and pipeline entities
  const { data: entities, error } = await supabase
    .from('entities_view')
    .select(`
      id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
      is_internal, is_portfolio, is_pipeline, importance
    `)
    .or('is_portfolio.eq.true,is_pipeline.eq.true,is_internal.eq.true')
    .order('importance', { ascending: false })
    .limit(Math.min(maxNodes, 100)); // Increased limit for better data loading

  if (error) throw error;

  if (!entities || entities.length === 0) {
    return [];
  }

  // Get connected entities
  const entityIds = entities.map(e => e.id);
  const { data: connectedEdges, error: edgesError } = await supabase
    .from('edges_view')
    .select('source, target, kind, strength_score')
    .or(`source.in.(${entityIds.join(',')}),target.in.(${entityIds.join(',')})`)
    .limit(2000);

  if (edgesError) {
    console.warn('Error fetching connected edges:', edgesError);
    return entities;
  }

  // Get unique connected entity IDs
  const connectedIds = new Set<string>();
  (connectedEdges || []).forEach(edge => {
    if (!entityIds.includes(edge.source)) connectedIds.add(edge.source);
    if (!entityIds.includes(edge.target)) connectedIds.add(edge.target);
  });

  // Load connected entities
  const connectedIdsArray = Array.from(connectedIds).slice(0, Math.min(connectedIds.size, maxNodes * 2));
  let connectedEntities: any[] = [];
  
  if (connectedIdsArray.length > 0) {
    const { data: connectedData, error: connectedError } = await supabase
      .from('entities_view')
      .select(`
        id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
        is_internal, is_portfolio, is_pipeline, importance
      `)
      .in('id', connectedIdsArray);

    if (connectedError) {
      console.warn('Error fetching connected entities:', connectedError);
    } else {
      connectedEntities = connectedData || [];
    }
  }

  return [...entities, ...connectedEntities];
}

async function loadDiligenceEntities(maxNodes: number) {
  // Load companies in investigate stage (5. Investigate)
  const { data: investigateEntities, error: investigateError } = await supabase
    .from('entities_view')
    .select(`
      id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
      is_internal, is_portfolio, is_pipeline, importance
    `)
    .eq('pipeline_stage', '5. Investigate')
    .order('importance', { ascending: false })
    .limit(Math.min(maxNodes, 100)); // Increased limit for better data loading

  if (investigateError) throw investigateError;

  if (!investigateEntities || investigateEntities.length === 0) {
    return [];
  }

  // Get connected entities (people, other companies connected to investigate companies)
  const investigateIds = investigateEntities.map(e => e.id);
  
  // Get edges connected to investigate companies
  const { data: connectedEdges, error: edgesError } = await supabase
    .from('edges_view')
    .select('source, target, kind, strength_score')
    .or(`source.in.(${investigateIds.join(',')}),target.in.(${investigateIds.join(',')})`)
    .limit(300);

  if (edgesError) {
    console.warn('Error fetching connected edges:', edgesError);
    return investigateEntities;
  }

  // Get unique connected entity IDs
  const connectedIds = new Set<string>();
  (connectedEdges || []).forEach(edge => {
    if (!investigateIds.includes(edge.source)) connectedIds.add(edge.source);
    if (!investigateIds.includes(edge.target)) connectedIds.add(edge.target);
  });

  // Load connected entities
  const connectedIdsArray = Array.from(connectedIds).slice(0, maxNodes - investigateEntities.length);
  let connectedEntities: any[] = [];
  
  if (connectedIdsArray.length > 0) {
    const { data: connectedData, error: connectedError } = await supabase
      .from('entities_view')
      .select(`
        id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
        is_internal, is_portfolio, is_pipeline, importance
      `)
      .in('id', connectedIdsArray);

    if (connectedError) {
      console.warn('Error fetching connected entities:', connectedError);
    } else {
      connectedEntities = connectedData || [];
    }
  }

  // Combine investigate entities with their connections
  return [...investigateEntities, ...connectedEntities];
}

async function loadImportantEntities(maxNodes: number) {
  // Load entities with high importance scores
  const { data: entities, error } = await supabase
    .from('entities_view')
    .select(`
      id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
      is_internal, is_portfolio, is_pipeline, importance
    `)
    .not('importance', 'is', null)
    .order('importance', { ascending: false })
    .limit(Math.min(maxNodes, 100)); // Increased limit for better data loading

  if (error) throw error;

  if (!entities || entities.length === 0) {
    return [];
  }

  // Get connected entities
  const entityIds = entities.map(e => e.id);
  const { data: connectedEdges, error: edgesError } = await supabase
    .from('edges_view')
    .select('source, target, kind, strength_score')
    .or(`source.in.(${entityIds.join(',')}),target.in.(${entityIds.join(',')})`)
    .limit(2000);

  if (edgesError) {
    console.warn('Error fetching connected edges:', edgesError);
    return entities;
  }

  // Get unique connected entity IDs
  const connectedIds = new Set<string>();
  (connectedEdges || []).forEach(edge => {
    if (!entityIds.includes(edge.source)) connectedIds.add(edge.source);
    if (!entityIds.includes(edge.target)) connectedIds.add(edge.target);
  });

  // Load connected entities
  const connectedIdsArray = Array.from(connectedIds).slice(0, Math.min(connectedIds.size, maxNodes * 2));
  let connectedEntities: any[] = [];
  
  if (connectedIdsArray.length > 0) {
    const { data: connectedData, error: connectedError } = await supabase
      .from('entities_view')
      .select(`
        id, name, type, domain, industry, pipeline_stage, fund, taxonomy,
        is_internal, is_portfolio, is_pipeline, importance
      `)
      .in('id', connectedIdsArray);

    if (connectedError) {
      console.warn('Error fetching connected entities:', connectedError);
    } else {
      connectedEntities = connectedData || [];
    }
  }

  return [...entities, ...connectedEntities];
}

async function getEdgesForEntities(entityIds: string[]) {
  if (entityIds.length === 0) return [];
  
  const { data: edges, error } = await supabase
    .from('edges_view')
    .select('id, source, target, kind, strength_score')
    .or(`source.in.(${entityIds.join(',')}),target.in.(${entityIds.join(',')})`)
    .limit(5000); // Increased limit to show more connections

  if (error) {
    console.warn('Error fetching edges:', error);
    return [];
  }
  
  return edges || [];
}

function formatNodes(entities: any[], edges: any[]) {
  // Calculate connection counts for node sizing
  const connectionCounts = new Map<string, number>();
  edges.forEach(edge => {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) || 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) || 0) + 1);
  });

  return entities.map(entity => ({
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
    importance: entity.importance || 0,
    size: Math.max(6, Math.min(20, 6 + Math.log(1 + (connectionCounts.get(entity.id) || 0)) * 3)),
    connection_count: connectionCounts.get(entity.id) || 0
  }));
}

function formatEdges(edges: any[]) {
  return edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind || "relationship",
    weight: edge.strength_score || 0.5
  }));
}

function cleanPersonName(name: string, type: string) {
  if (type === 'person' && name.includes(';')) {
    return name.split(';')[0].trim();
  }
  return name;
}

async function getTotalEntityCount() {
  const { count, error } = await supabase
    .from('entities_view')
    .select('*', { count: 'exact', head: true });
  
  if (error) return 0;
  return count || 0;
}
