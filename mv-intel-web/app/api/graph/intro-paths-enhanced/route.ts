import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

interface IntroPath {
  path: Array<{
    id: string;
    name: string;
    type: string;
    role: string;
    connection_strength: number;
    connection_type: string;
    mutual_connections?: string[];
    shared_expertise?: string[];
    shared_location?: string;
    linkedin_first_degree?: boolean;
  }>;
  total_strength: number;
  path_length: number;
  reasoning: string;
}

interface IntroPathRequest {
  target_entity_id: string;
  source_entity_id?: string;
  max_path_length?: number;
  min_strength?: number;
  max_paths?: number;
}

async function findIntroPaths(request: IntroPathRequest): Promise<IntroPath[]> {
  const {
    target_entity_id,
    source_entity_id,
    max_path_length = 3,
    min_strength = 0.3,
    max_paths = 5
  } = request;

  console.log(`🔍 Finding intro paths to entity ${target_entity_id}`);

  // Get target entity details
  const { data: targetEntity, error: targetError } = await supabase
    .schema('graph')
    .from('entities')
    .select(`
      id,
      name,
      type,
      enrichment_data,
      linkedin_first_degree,
      linkedin_url
    `)
    .eq('id', target_entity_id)
    .single();

  if (targetError || !targetEntity) {
    throw new Error('Target entity not found');
  }

  // Get source entity (default to internal owners if not specified)
  let sourceEntity;
  if (source_entity_id) {
    const { data, error } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, enrichment_data')
      .eq('id', source_entity_id)
      .single();
    
    if (error || !data) {
      throw new Error('Source entity not found');
    }
    sourceEntity = data;
  } else {
    // Find internal owners (people who work at Motive Ventures)
    const { data: internalOwners, error: internalError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, enrichment_data')
      .eq('type', 'person')
      .or('enrichment_data->current_employer.ilike.%Motive%,enrichment_data->current_employer.ilike.%Ventures%,enrichment_data->current_employer.ilike.%Partners%')
      .limit(10);

    if (internalError || !internalOwners || internalOwners.length === 0) {
      // Fallback: use any person entity as source
      const { data: fallbackOwners, error: fallbackError } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, enrichment_data')
        .eq('type', 'person')
        .limit(5);
      
      if (fallbackError || !fallbackOwners || fallbackOwners.length === 0) {
        throw new Error('No internal owners found');
      }
      sourceEntity = fallbackOwners[0];
    } else {
      sourceEntity = internalOwners[0]; // Use first internal owner as source
    }
  }

  console.log(`📍 Source: ${sourceEntity.name}, Target: ${targetEntity.name}`);

  // Get all edges for pathfinding
  const { data: edges, error: edgesError } = await supabase
    .schema('graph')
    .from('edges')
    .select(`
      source,
      target,
      kind,
      weight,
      strength_score,
      sources
    `);

  if (edgesError) {
    throw new Error('Failed to fetch edges');
  }

  // Build adjacency list
  const graph = new Map<string, Array<{
    target: string;
    kind: string;
    weight: number;
    strength_score: number;
    sources: any;
  }>>();

  edges.forEach(edge => {
    if (!graph.has(edge.source)) {
      graph.set(edge.source, []);
    }
    graph.get(edge.source)!.push({
      target: edge.target,
      kind: edge.kind,
      weight: edge.weight,
      strength_score: edge.strength_score,
      sources: edge.sources
    });
  });

  // BFS to find all paths
  const paths: IntroPath[] = [];
  const queue: Array<{
    current: string;
    path: string[];
    strength: number;
    visited: Set<string>;
  }> = [{
    current: sourceEntity.id,
    path: [sourceEntity.id],
    strength: 1.0,
    visited: new Set([sourceEntity.id])
  }];

  while (queue.length > 0 && paths.length < max_paths) {
    const { current, path, strength, visited } = queue.shift()!;

    if (current === target_entity_id) {
      // Found a path to target
      const introPath = await buildIntroPath(path, strength);
      if (introPath.total_strength >= min_strength) {
        paths.push(introPath);
      }
      continue;
    }

    if (path.length >= max_path_length) {
      continue;
    }

    const neighbors = graph.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.target)) {
        const newVisited = new Set(visited);
        newVisited.add(neighbor.target);
        
        queue.push({
          current: neighbor.target,
          path: [...path, neighbor.target],
          strength: strength * neighbor.strength_score,
          visited: newVisited
        });
      }
    }
  }

  // Sort paths by strength
  paths.sort((a, b) => b.total_strength - a.total_strength);

  console.log(`✅ Found ${paths.length} intro paths`);
  return paths;
}

async function buildIntroPath(path: string[], totalStrength: number): Promise<IntroPath> {
  // Get entity details for each step in the path
  const { data: entities, error } = await supabase
    .schema('graph')
    .from('entities')
    .select(`
      id,
      name,
      type,
      enrichment_data,
      linkedin_first_degree,
      linkedin_url
    `)
    .in('id', path);

  if (error || !entities) {
    throw new Error('Failed to fetch entity details');
  }

  // Get edges between consecutive entities in the path
  const pathEdges: any[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const { data: edge } = await supabase
      .schema('graph')
      .from('edges')
      .select('kind, strength_score, sources')
      .eq('source', path[i])
      .eq('target', path[i + 1])
      .single();

    if (edge) {
      pathEdges.push(edge);
    }
  }

  // Build the intro path
  const introPath: IntroPath = {
    path: entities.map((entity, index) => {
      const edge = pathEdges[index];
      const enrichmentData = entity.enrichment_data || {};
      
      return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        role: enrichmentData.current_title || enrichmentData.current_employer || 'Unknown',
        connection_strength: edge?.strength_score || 0.5,
        connection_type: edge?.kind || 'unknown',
        mutual_connections: enrichmentData.mutual_connections || [],
        shared_expertise: enrichmentData.specific_technologies || [],
        shared_location: enrichmentData.current_location,
        linkedin_first_degree: entity.linkedin_first_degree
      };
    }),
    total_strength: totalStrength,
    path_length: path.length,
    reasoning: generateReasoning(entities, pathEdges)
  };

  return introPath;
}

function generateReasoning(entities: any[], edges: any[]): string {
  const reasoning = [];
  
  for (let i = 0; i < entities.length - 1; i++) {
    const current = entities[i];
    const next = entities[i + 1];
    const edge = edges[i];
    
    const currentEnrichment = current.enrichment_data || {};
    const nextEnrichment = next.enrichment_data || {};
    
    // Find shared connections
    const currentConnections = currentEnrichment.mutual_connections || [];
    const nextConnections = nextEnrichment.mutual_connections || [];
    const sharedConnections = currentConnections.filter((conn: string) => 
      nextConnections.includes(conn)
    );
    
    // Find shared expertise
    const currentTech = currentEnrichment.specific_technologies || [];
    const nextTech = nextEnrichment.specific_technologies || [];
    const sharedTech = currentTech.filter((tech: string) => 
      nextTech.includes(tech)
    );
    
    // Find shared location
    const sharedLocation = currentEnrichment.current_location === nextEnrichment.current_location 
      ? currentEnrichment.current_location 
      : null;
    
    let connectionReason = '';
    
    if (sharedConnections.length > 0) {
      connectionReason += `Mutual connections: ${sharedConnections.slice(0, 2).join(', ')}`;
    }
    
    if (sharedTech.length > 0) {
      connectionReason += connectionReason ? '; ' : '';
      connectionReason += `Shared expertise: ${sharedTech.slice(0, 2).join(', ')}`;
    }
    
    if (sharedLocation) {
      connectionReason += connectionReason ? '; ' : '';
      connectionReason += `Same location: ${sharedLocation}`;
    }
    
    if (edge?.kind) {
      connectionReason += connectionReason ? '; ' : '';
      connectionReason += `Connection type: ${edge.kind}`;
    }
    
    if (next.linkedin_first_degree) {
      connectionReason += connectionReason ? '; ' : '';
      connectionReason += 'LinkedIn 1st degree connection';
    }
    
    reasoning.push(`${current.name} → ${next.name}: ${connectionReason}`);
  }
  
  return reasoning.join(' | ');
}

// API endpoint for intro paths
export async function POST(req: Request) {
  try {
    const request: IntroPathRequest = await req.json();
    const paths = await findIntroPaths(request);
    
    return new Response(JSON.stringify(paths), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Intro path error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

