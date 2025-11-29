import { NextRequest, NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';
import { neo4jCache, CACHE_TTL } from '../../../../lib/neo4j-cache';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '1000', 10);
  const nodeType = searchParams.get('type');
  const includeInternal = searchParams.get('internal') === 'true';
  const minImportance = parseFloat(searchParams.get('minImportance') || '0');

  // Create cache key
  const cacheKey = `graph-data-${limit}-${nodeType}-${includeInternal}-${minImportance}`;
  
  // Check cache first
  const cachedResult = neo4jCache.get(cacheKey);
  if (cachedResult) {
    neo4jCache.recordHit();
    console.log('📦 Returning cached graph data');
    return NextResponse.json(cachedResult);
  }

  neo4jCache.recordMiss();
  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log(`🔍 Fetching graph data: limit=${limit} (type: ${typeof limit}), type=${nodeType}, internal=${includeInternal}`);

    // Build dynamic query based on filters
    let whereClause = 'WHERE 1=1';
    const params: any = { limit: Number(limit) };

    if (nodeType) {
      whereClause += ' AND n.type = $nodeType';
      params.nodeType = nodeType;
    }

    if (!includeInternal) {
      whereClause += ' AND (n.is_internal IS NULL OR n.is_internal = false)';
    }

    if (minImportance > 0) {
      whereClause += ' AND (n.importance IS NULL OR n.importance >= $minImportance)';
      params.minImportance = minImportance;
    }

    const query = `
      MATCH (n:Entity)
      ${whereClause}
      WITH n
      ORDER BY n.importance DESC, n.name ASC
      LIMIT ${limit}
      MATCH (n)-[r:RELATES]-(m:Entity)
      RETURN n, r, m
    `;

    const result = await session.run(query, params);

    // Process results
    const nodeMap = new Map();
    const edgeMap = new Map(); // Use Map to deduplicate edges by key

    result.records.forEach(record => {
      const node = record.get('n');
      const rel = record.get('r');
      const other = record.get('m');

      // Add nodes to map (avoid duplicates)
      if (!nodeMap.has(node.properties.id)) {
        nodeMap.set(node.properties.id, {
          id: node.properties.id,
          label: node.properties.name,
          type: node.properties.type, // Use properties.type directly
          industry: node.properties.industry,
          pipeline_stage: node.properties.pipeline_stage,
          fund: node.properties.fund,
          is_internal: node.properties.is_internal || false,
          is_portfolio: node.properties.is_portfolio || false,
          is_pipeline: node.properties.is_pipeline || false,
          importance: node.properties.importance || 0,
          linkedin_first_degree: node.properties.linkedin_first_degree || false,
          domain: node.properties.domain,
          brief_description: node.properties.brief_description,
          location_city: node.properties.location_city,
          location_country: node.properties.location_country,
          year_founded: node.properties.year_founded,
          employee_count: node.properties.employee_count,
          valuation_amount: node.properties.valuation_amount,
          investment_amount: node.properties.investment_amount,
          // Calculate size based on importance and connections
          size: Math.max(10, Math.min(30, 10 + (node.properties.importance || 0) * 20))
        });
      }

      if (!nodeMap.has(other.properties.id)) {
        nodeMap.set(other.properties.id, {
          id: other.properties.id,
          label: other.properties.name,
          type: other.properties.type, // Use properties.type directly
          industry: other.properties.industry,
          pipeline_stage: other.properties.pipeline_stage,
          fund: other.properties.fund,
          is_internal: other.properties.is_internal || false,
          is_portfolio: other.properties.is_portfolio || false,
          is_pipeline: other.properties.is_pipeline || false,
          importance: other.properties.importance || 0,
          linkedin_first_degree: other.properties.linkedin_first_degree || false,
          domain: other.properties.domain,
          brief_description: other.properties.brief_description,
          location_city: other.properties.location_city,
          location_country: other.properties.location_country,
          year_founded: other.properties.year_founded,
          employee_count: other.properties.employee_count,
          valuation_amount: other.properties.valuation_amount,
          investment_amount: other.properties.investment_amount,
          size: Math.max(10, Math.min(30, 10 + (other.properties.importance || 0) * 20))
        });
      }

      // Add relationship (Deduplication Logic)
      if (rel) {
        const sourceId = node.properties.id;
        const targetId = other.properties.id;
        // Create a unique key for the edge that is order-independent to prevent A-B and B-A duplicates
        const edgeKey = [sourceId, targetId].sort().join('-');
        
        const newEdge = {
          id: rel.properties.id || edgeKey,
          source: sourceId,
          target: targetId,
          kind: rel.properties.kind || 'relationship',
          weight: rel.properties.strength_score || 0.5,
          strength_score: rel.properties.strength_score || 0.5,
          interaction_count: rel.properties.interaction_count || 0
        };

        // If edge doesn't exist, or if new edge is stronger, store it
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, newEdge);
        } else {
          const existingEdge = edgeMap.get(edgeKey);
          if ((newEdge.strength_score || 0) > (existingEdge.strength_score || 0)) {
             edgeMap.set(edgeKey, newEdge);
          }
        }
      }
    });

    const nodes = Array.from(nodeMap.values());
    const edges = Array.from(edgeMap.values());

    console.log(`✅ Fetched ${nodes.length} nodes and ${edges.length} edges`);

    const responseData = {
      success: true,
      data: {
        nodes,
        edges
      },
      meta: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        filters: {
          limit,
          nodeType,
          includeInternal,
          minImportance
        }
      }
    };

    // Cache the result
    neo4jCache.set(cacheKey, {}, responseData, CACHE_TTL.GRAPH_DATA);
    
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error fetching graph data:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch graph data',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await session.close();
  }
}
