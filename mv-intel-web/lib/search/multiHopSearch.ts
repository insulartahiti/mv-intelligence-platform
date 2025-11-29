// Enhanced Knowledge Graph Intelligence - Multi-Hop Semantic Search
// Find entities by relationship context, not just direct similarity

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export interface SearchResult {
  id: string;
  name: string;
  type: string;
  similarity: number;
  pathScore: number;
  finalScore: number;
  metadata: any;
  path?: {
    nodes: string[];
    edges: string[];
    description: string;
  };
}

export interface MultiHopQuery {
  seedEntities: string[];
  targetType?: string;
  relationshipTypes?: string[];
  maxHops: number;
  minPathStrength: number;
  contextQuery?: string;
}

/**
 * Multi-hop semantic search - find entities by relationship context
 */
export async function multiHopSearch(
  query: string,
  options: {
    maxHops?: number;
    minPathStrength?: number;
    targetType?: string;
    relationshipTypes?: string[];
    limit?: number;
  } = {}
): Promise<SearchResult[]> {
  const {
    maxHops = 2,
    minPathStrength = 0.3,
    targetType,
    relationshipTypes = [],
    limit = 20
  } = options;

  try {
    // 1. Find seed entities matching the query
    const seedEntities = await findSeedEntities(query, 10);
    
    if (seedEntities.length === 0) {
      return [];
    }

    // 2. Perform multi-hop traversal from seed entities
    const multiHopResults = await performMultiHopTraversal(
      seedEntities,
      {
        maxHops,
        minPathStrength,
        targetType,
        relationshipTypes
      }
    );

    // 3. Score results by path strength and semantic relevance
    const scoredResults = await scoreMultiHopResults(
      multiHopResults,
      query,
      seedEntities
    );

    // 4. Sort by final score and return top results
    return scoredResults
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

  } catch (error) {
    console.error('Multi-hop search error:', error);
    return [];
  }
}

/**
 * Find seed entities that match the query
 */
async function findSeedEntities(query: string, limit: number): Promise<string[]> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Search for entities using semantic similarity
    const { data: results, error } = await supabase
      .rpc('match_entities_3072', {
        query_embedding: queryEmbedding,
        match_threshold: 0.4,
        match_count: limit
      });

    if (error) {
      console.error('Seed entity search error:', error);
      return [];
    }

    return (results || []).map((entity: any) => entity.id);

  } catch (error) {
    console.error('Error finding seed entities:', error);
    return [];
  }
}

/**
 * Perform multi-hop traversal from seed entities
 */
async function performMultiHopTraversal(
  seedEntities: string[],
  options: {
    maxHops: number;
    minPathStrength: number;
    targetType?: string;
    relationshipTypes: string[];
  }
): Promise<Array<{
  entityId: string;
  path: string[];
  pathStrength: number;
  hopCount: number;
}>> {
  const { maxHops, minPathStrength, targetType, relationshipTypes } = options;
  const visited = new Set<string>();
  const results: Array<{
    entityId: string;
    path: string[];
    pathStrength: number;
    hopCount: number;
  }> = [];

  // BFS traversal from each seed entity
  for (const seedEntity of seedEntities) {
    const queue: Array<{
      entityId: string;
      path: string[];
      pathStrength: number;
      hopCount: number;
    }> = [{
      entityId: seedEntity,
      path: [seedEntity],
      pathStrength: 1.0,
      hopCount: 0
    }];

    while (queue.length > 0) {
      const { entityId, path, pathStrength, hopCount } = queue.shift()!;

      if (hopCount >= maxHops || visited.has(entityId)) {
        continue;
      }

      visited.add(entityId);

      // Get connected entities
      const connectedEntities = await getConnectedEntities(
        entityId,
        relationshipTypes,
        targetType
      );

      for (const connection of connectedEntities) {
        const newPath = [...path, connection.targetId];
        const newPathStrength = pathStrength * connection.strength;
        const newHopCount = hopCount + 1;

        // Add to results if it meets criteria
        if (newPathStrength >= minPathStrength) {
          results.push({
            entityId: connection.targetId,
            path: newPath,
            pathStrength: newPathStrength,
            hopCount: newHopCount
          });
        }

        // Continue traversal if within hop limit
        if (newHopCount < maxHops) {
          queue.push({
            entityId: connection.targetId,
            path: newPath,
            pathStrength: newPathStrength,
            hopCount: newHopCount
          });
        }
      }
    }
  }

  return results;
}

/**
 * Get entities connected to a given entity
 */
async function getConnectedEntities(
  entityId: string,
  relationshipTypes: string[],
  targetType?: string
): Promise<Array<{
  targetId: string;
  strength: number;
  relationshipType: string;
}>> {
  try {
    let query = supabase
      .schema('graph')
      .from('edges')
      .select(`
        target,
        source,
        kind,
        strength_score,
        target_entity:entities!edges_target_fkey(id, name, type)
      `)
      .or(`source.eq.${entityId},target.eq.${entityId}`);

    if (relationshipTypes.length > 0) {
      query = query.in('kind', relationshipTypes);
    }

    const { data: edges, error } = await supabase
      .schema('graph')
      .from('edges')
      .select(`
        target,
        source,
        kind,
        strength_score
      `)
      .or(`source.eq.${entityId},target.eq.${entityId}`);

    if (error) {
      console.error('Error getting connected entities:', error);
      return [];
    }

    const connections: Array<{
      targetId: string;
      strength: number;
      relationshipType: string;
    }> = [];

    for (const edge of edges || []) {
      const targetId = edge.source === entityId ? edge.target : edge.source;
      
      // Get target entity details to check type
      const { data: targetEntity } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, type')
        .eq('id', targetId)
        .single();

      if (targetEntity && (!targetType || targetEntity.type === targetType)) {
        connections.push({
          targetId,
          strength: edge.strength_score || 0.5,
          relationshipType: edge.kind
        });
      }
    }

    return connections;

  } catch (error) {
    console.error('Error getting connected entities:', error);
    return [];
  }
}

/**
 * Score multi-hop results by path strength and semantic relevance
 */
async function scoreMultiHopResults(
  results: Array<{
    entityId: string;
    path: string[];
    pathStrength: number;
    hopCount: number;
  }>,
  query: string,
  seedEntities: string[]
): Promise<SearchResult[]> {
  const scoredResults: SearchResult[] = [];

  for (const result of results) {
    try {
      // Get entity details
      const { data: entity } = await supabase
        .schema('graph')
        .from('entities')
        .select('id, name, type, domain, industry, pipeline_stage, fund, taxonomy, is_internal, is_portfolio, is_pipeline, importance, enrichment_data, ai_summary, ai_insights, ai_tags')
        .eq('id', result.entityId)
        .single();

      if (!entity) continue;

      // Calculate semantic similarity to query
      const semanticSimilarity = await calculateSemanticSimilarity(query, entity);

      // Calculate path score (shorter paths are better)
      const pathScore = result.pathStrength * Math.pow(0.8, result.hopCount - 1);

      // Calculate final score
      const finalScore = (semanticSimilarity * 0.6 + pathScore * 0.4);

      // Generate path description
      const pathDescription = generatePathDescription(result.path, result.hopCount);

      scoredResults.push({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        similarity: semanticSimilarity,
        pathScore,
        finalScore,
        metadata: {
          domain: entity.domain,
          industry: entity.industry,
          pipeline_stage: entity.pipeline_stage,
          fund: entity.fund,
          taxonomy: entity.taxonomy,
          internal_owner: entity.is_internal,
          is_portfolio: entity.is_portfolio,
          is_pipeline: entity.is_pipeline,
          importance: entity.importance,
          ai_summary: entity.ai_summary,
          ai_insights: entity.ai_insights,
          ai_tags: entity.ai_tags,
          has_enrichment_data: !!entity.enrichment_data,
          enrichment_insights: entity.enrichment_data?.parsed_web_data?.keyInsights || [],
          recent_news: entity.enrichment_data?.parsed_web_data?.recentNews?.length || 0,
          company_info: entity.enrichment_data?.parsed_web_data?.companyInfo || {}
        },
        path: {
          nodes: result.path,
          edges: [], // Would need to fetch edge IDs
          description: pathDescription
        }
      });

    } catch (error) {
      console.error('Error scoring result:', error);
      continue;
    }
  }

  return scoredResults;
}

/**
 * Calculate semantic similarity between query and entity
 */
async function calculateSemanticSimilarity(query: string, entity: any): Promise<number> {
  try {
    // Generate embeddings for both query and entity
    const queryEmbedding = await generateQueryEmbedding(query);
    
    // Use entity's existing embedding or generate one
    let entityEmbedding = entity.embedding_3072 || entity.embedding;
    
    if (!entityEmbedding) {
      // Generate embedding for entity
      const entityText = `${entity.name} ${entity.type} ${entity.domain || ''} ${entity.industry || ''}`;
      entityEmbedding = await generateQueryEmbedding(entityText);
    }

    // Calculate cosine similarity
    return cosineSimilarity(queryEmbedding, entityEmbedding);

  } catch (error) {
    console.error('Error calculating semantic similarity:', error);
    return 0.5; // Default similarity
  }
}

/**
 * Generate query embedding using OpenAI
 */
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not found');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate human-readable path description
 */
function generatePathDescription(path: string[], hopCount: number): string {
  if (hopCount === 1) {
    return 'Direct connection';
  } else if (hopCount === 2) {
    return 'One degree of separation';
  } else if (hopCount === 3) {
    return 'Two degrees of separation';
  } else {
    return `${hopCount - 1} degrees of separation`;
  }
}

/**
 * Find entities similar to a target entity through relationships
 */
export async function findSimilarEntities(
  targetEntityId: string,
  options: {
    maxHops?: number;
    minSimilarity?: number;
    relationshipTypes?: string[];
    limit?: number;
  } = {}
): Promise<SearchResult[]> {
  const {
    maxHops = 2,
    minSimilarity = 0.6,
    relationshipTypes = [],
    limit = 20
  } = options;

  try {
    // Get target entity details
    const { data: targetEntity } = await supabase
      .schema('graph')
      .from('entities')
      .select('*')
      .eq('id', targetEntityId)
      .single();

    if (!targetEntity) {
      return [];
    }

    // Create a query based on the target entity
    const query = `${targetEntity.name} ${targetEntity.type} ${targetEntity.industry || ''} ${targetEntity.domain || ''}`;

    // Use multi-hop search to find similar entities
    return await multiHopSearch(query, {
      maxHops,
      minPathStrength: minSimilarity,
      relationshipTypes,
      limit
    });

  } catch (error) {
    console.error('Error finding similar entities:', error);
    return [];
  }
}

/**
 * Find introduction paths between two entities
 */
export async function findIntroductionPaths(
  sourceEntityId: string,
  targetEntityId: string,
  options: {
    maxHops?: number;
    minPathStrength?: number;
    relationshipTypes?: string[];
    limit?: number;
  } = {}
): Promise<Array<{
  path: string[];
  strength: number;
  description: string;
  entities: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}>> {
  const {
    maxHops = 3,
    minPathStrength = 0.3,
    relationshipTypes = [],
    limit = 5
  } = options;

  try {
    // Use the graph algorithm to find paths
    const { data: paths } = await supabase
      .rpc('find_all_paths', {
        source_id: sourceEntityId,
        target_id: targetEntityId,
        max_depth: maxHops,
        max_paths: limit
      });

    if (!paths || paths.length === 0) {
      return [];
    }

    // Get entity details for each path
    const enrichedPaths = await Promise.all(
      paths.map(async (path: any) => {
        const entityIds = path.path_nodes;
        const entities = [];

        for (const entityId of entityIds) {
          const { data: entity } = await supabase
            .schema('graph')
            .from('entities')
            .select('id, name, type')
            .eq('id', entityId)
            .single();

          if (entity) {
            entities.push(entity);
          }
        }

        return {
          path: entityIds,
          strength: path.path_score,
          description: generatePathDescription(entityIds, entityIds.length - 1),
          entities
        };
      })
    );

    return enrichedPaths;

  } catch (error) {
    console.error('Error finding introduction paths:', error);
    return [];
  }
}
