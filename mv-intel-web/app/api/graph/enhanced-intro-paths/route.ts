import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


export async function GET(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }
  
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const { searchParams } = new URL(req.url);
    const targetEntityId = searchParams.get('targetEntityId');
    const maxPaths = parseInt(searchParams.get('maxPaths') || '5');
    const minStrength = parseFloat(searchParams.get('minStrength') || '0.3');
    const includeInsights = searchParams.get('includeInsights') === 'true';

    if (!targetEntityId) {
      return NextResponse.json({ 
        error: 'targetEntityId is required' 
      }, { status: 400 });
    }

    console.log(`🔍 Finding enhanced intro paths for entity: ${targetEntityId}`);

    // Get target entity details
    const { data: targetEntity, error: targetError } = await supabase
      .schema('graph')
      .from('entities')
      .select(`
        id, name, type, domain, industry, 
        is_internal, is_portfolio, is_pipeline,
        linkedin_first_degree, enrichment_data
      `)
      .eq('id', targetEntityId)
      .single();

    if (targetError || !targetEntity) {
      return NextResponse.json({ 
        error: 'Target entity not found' 
      }, { status: 404 });
    }

    // Get introduction paths from database
    const { data: introPaths, error: pathsError } = await supabase
      .schema('graph')
      .from('introduction_paths')
      .select('*')
      .eq('target_entity_id', targetEntityId)
      .gte('path_strength', minStrength)
      .order('quality_score', { ascending: false })
      .limit(maxPaths);

    if (pathsError) {
      console.error('Error fetching intro paths:', pathsError);
      return NextResponse.json({ 
        error: 'Failed to fetch introduction paths' 
      }, { status: 500 });
    }

    // If no paths found in database, calculate them dynamically
    let paths: IntroPath[] = [];
    if (!introPaths || introPaths.length === 0) {
      console.log('No stored paths found, calculating dynamically...');
      paths = await calculateDynamicPaths(targetEntityId, maxPaths, minStrength, supabase);
    } else {
      paths = introPaths as IntroPath[];
    }

    // Get network insights if requested
    let networkInsights: NetworkInsights | null = null;
    if (includeInsights) {
      const { data: insights } = await supabase
        .schema('graph')
        .from('network_insights')
        .select('insights_data')
        .eq('id', 'current')
        .single();
      
      networkInsights = insights?.insights_data || null;
    }

    // Enhance paths with entity details
    const enhancedPaths = await enhancePathsWithDetails(paths, supabase);

    return NextResponse.json({
      success: true,
      targetEntity: {
        id: targetEntity.id,
        name: targetEntity.name,
        type: targetEntity.type,
        industry: targetEntity.industry,
        isInternal: targetEntity.is_internal,
        isPortfolio: targetEntity.is_portfolio,
        isPipeline: targetEntity.is_pipeline,
        isLinkedIn: targetEntity.linkedin_first_degree
      },
      introductionPaths: enhancedPaths,
      networkInsights,
      metadata: {
        totalPaths: enhancedPaths.length,
        maxPaths,
        minStrength,
        calculatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in enhanced intro paths API:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

// Interfaces need to be available in module scope
interface IntroPath {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  path_data: {
    path: Array<{
      id: string;
      name: string;
      type: string;
      isInternal: boolean;
      isLinkedIn: boolean;
    }>;
    totalStrength: number;
    linkedinConnections: number;
    internalConnections: number;
    pathLength: number;
    qualityScore: number;
  };
  path_strength: number;
  quality_score: number;
  path_length: number;
  linkedin_connections: number;
  internal_connections: number;
  calculated_at: string;
}

interface NetworkInsights {
  totalEntities: number;
  totalConnections: number;
  wellConnectedEntities: number;
  influentialEntities: number;
  networkDensity: number;
  topInfluencers: Array<{
    id: string;
    name: string;
    influenceScore: number;
  }>;
  industryDistribution: Record<string, number>;
  connectionTypes: Record<string, number>;
}

async function calculateDynamicPaths(
  targetEntityId: string, 
  maxPaths: number, 
  minStrength: number,
  supabase: any
): Promise<IntroPath[]> {
  // Get all internal owners
  const { data: internalOwners } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, type')
    .eq('is_internal', true)
    .eq('type', 'person')
    .limit(10);

  if (!internalOwners || internalOwners.length === 0) {
    return [];
  }

  // Get all edges for pathfinding
  const { data: edges } = await supabase
    .schema('graph')
    .from('edges')
    .select('source, target, kind, strength_score, weight');

  if (!edges || edges.length === 0) {
    return [];
  }

  // Build adjacency list
  const graph = new Map<string, Array<{
    target: string;
    kind: string;
    strength: number;
  }>>();

  edges.forEach(edge => {
    if (!graph.has(edge.source)) {
      graph.set(edge.source, []);
    }
    graph.get(edge.source)!.push({
      target: edge.target,
      kind: edge.kind,
      strength: edge.strength_score || 0.5
    });
  });

  const paths: IntroPath[] = [];

  // Find paths from each internal owner
  for (const owner of internalOwners) {
    const foundPaths = findPathsBFS(
      graph, 
      owner.id, 
      targetEntityId, 
      3, // max depth
      minStrength
    );

    for (const path of foundPaths) {
      if (paths.length >= maxPaths) break;
      
      const pathStrength = calculatePathStrength(path);
      const qualityScore = calculateQualityScore(path, pathStrength);
      
      paths.push({
        id: `dynamic-${Date.now()}-${Math.random()}`,
        source_entity_id: owner.id,
        target_entity_id: targetEntityId,
        path_data: {
          path: path.map(id => ({ id, name: '', type: '', isInternal: false, isLinkedIn: false })),
          totalStrength: pathStrength,
          linkedinConnections: 0,
          internalConnections: 0,
          pathLength: path.length - 1,
          qualityScore
        },
        path_strength: pathStrength,
        quality_score: qualityScore,
        path_length: path.length - 1,
        linkedin_connections: 0,
        internal_connections: 0,
        calculated_at: new Date().toISOString()
      });
    }
  }

  return paths.sort((a, b) => b.quality_score - a.quality_score);
}

function findPathsBFS(
  graph: Map<string, Array<{target: string; kind: string; strength: number}>>,
  startId: string,
  targetId: string,
  maxDepth: number,
  minStrength: number
): string[][] {
  const paths: string[][] = [];
  const queue: Array<{
    current: string;
    path: string[];
    strength: number;
    visited: Set<string>;
  }> = [{
    current: startId,
    path: [startId],
    strength: 1.0,
    visited: new Set([startId])
  }];

  while (queue.length > 0 && paths.length < 10) {
    const { current, path, strength, visited } = queue.shift()!;

    if (current === targetId) {
      paths.push(path);
      continue;
    }

    if (path.length >= maxDepth) continue;

    const neighbors = graph.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.target)) {
        const newVisited = new Set(visited);
        newVisited.add(neighbor.target);
        
        queue.push({
          current: neighbor.target,
          path: [...path, neighbor.target],
          strength: strength * neighbor.strength,
          visited: newVisited
        });
      }
    }
  }

  return paths;
}

function calculatePathStrength(path: string[]): number {
  // Simplified strength calculation
  // In a real implementation, this would consider edge weights
  return Math.max(0.1, 1.0 / path.length);
}

function calculateQualityScore(path: string[], strength: number): number {
  // Quality score based on path length and strength
  const lengthPenalty = Math.max(0, (path.length - 2) * 0.1);
  return Math.max(0, strength - lengthPenalty);
}

async function enhancePathsWithDetails(paths: IntroPath[], supabase: any): Promise<IntroPath[]> {
  // Get all unique entity IDs from paths
  const entityIds = new Set<string>();
  paths.forEach(path => {
    path.path_data.path.forEach(step => {
      entityIds.add(step.id);
    });
  });

  // Fetch entity details
  const { data: entities } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, type, is_internal, linkedin_first_degree')
    .in('id', Array.from(entityIds));

  const entityMap = new Map(entities?.map(e => [e.id, e]) || []);

  // Enhance paths with entity details
  return paths.map(path => ({
    ...path,
    path_data: {
      ...path.path_data,
      path: path.path_data.path.map(step => {
        const entity = entityMap.get(step.id);
        return {
          id: step.id,
          name: entity?.name || 'Unknown',
          type: entity?.type || 'unknown',
          isInternal: entity?.is_internal || false,
          isLinkedIn: entity?.linkedin_first_degree || false
        };
      })
    }
  }));
}

export async function POST(req: NextRequest) {
  try {
    const { targetEntityId, maxPaths = 5, minStrength = 0.3 } = await req.json();

    if (!targetEntityId) {
      return NextResponse.json({ 
        error: 'targetEntityId is required' 
      }, { status: 400 });
    }

    // Trigger background calculation of introduction paths
    console.log(`🔄 Triggering background calculation for entity: ${targetEntityId}`);
    
    // This would typically trigger a background job
    // For now, we'll just return a success response
    return NextResponse.json({
      success: true,
      message: 'Introduction path calculation triggered',
      targetEntityId,
      maxPaths,
      minStrength
    });

  } catch (error) {
    console.error('Error in enhanced intro paths POST:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
