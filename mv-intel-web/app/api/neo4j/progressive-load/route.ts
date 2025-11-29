import { NextRequest, NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'overview';
  const limit = parseInt(searchParams.get('limit') || '500', 10);
  const centerNodeId = searchParams.get('centerNodeId');

  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log(`🔍 Progressive load: mode=${mode}, limit=${limit}, center=${centerNodeId}`);

    let query: string;
    let params: any = { limit };

    if (centerNodeId) {
      // Load around a specific node
      query = `
        MATCH (center:Entity {id: $centerNodeId})
        OPTIONAL MATCH (center)-[r1:RELATES]-(connected:Entity)
        WITH center, collect(DISTINCT connected) as directConnections
        UNWIND directConnections as conn
        OPTIONAL MATCH (conn)-[r2:RELATES]-(extended:Entity)
        WHERE extended <> center
        WITH center, directConnections, collect(DISTINCT extended) as extendedConnections
        UNWIND (directConnections + extendedConnections) as node
        WITH DISTINCT node
        ORDER BY 
          CASE WHEN node.is_internal = true THEN 0 ELSE 1 END,
          node.importance DESC,
          node.name ASC
        LIMIT $limit
        MATCH (node)-[r:RELATES]-(other:Entity)
        WHERE other IN (directConnections + extendedConnections)
        RETURN node, r, other
      `;
      params.centerNodeId = centerNodeId;
    } else {
      // Load based on mode
      switch (mode) {
        case 'internal':
          query = `
            MATCH (n:Entity)
            WHERE n.is_internal = true
            WITH n
            ORDER BY n.importance DESC, n.name ASC
            LIMIT $limit
            MATCH (n)-[r:RELATES]-(m:Entity)
            RETURN n, r, m
          `;
          break;
        
        case 'portfolio':
          query = `
            MATCH (n:Entity)
            WHERE n.is_portfolio = true OR n.pipeline_stage = 'portfolio'
            WITH n
            ORDER BY n.importance DESC, n.name ASC
            LIMIT $limit
            MATCH (n)-[r:RELATES]-(m:Entity)
            RETURN n, r, m
          `;
          break;
        
        case 'high-importance':
          query = `
            MATCH (n:Entity)
            WHERE n.importance >= 0.7
            WITH n
            ORDER BY n.importance DESC, n.name ASC
            LIMIT $limit
            MATCH (n)-[r:RELATES]-(m:Entity)
            RETURN n, r, m
          `;
          break;
        
        case 'recent':
          query = `
            MATCH (n:Entity)
            WHERE n.updated_at IS NOT NULL
            WITH n
            ORDER BY n.updated_at DESC, n.importance DESC
            LIMIT $limit
            MATCH (n)-[r:RELATES]-(m:Entity)
            RETURN n, r, m
          `;
          break;
        
        default: // overview
          query = `
            MATCH (n:Entity)
            WHERE n.importance >= 0.5 OR n.is_internal = true
            WITH n
            ORDER BY n.importance DESC, n.name ASC
            LIMIT $limit
            MATCH (n)-[r:RELATES]-(m:Entity)
            RETURN n, r, m
          `;
      }
    }

    const result = await session.run(query, params);

    // Process results
    const nodeMap = new Map();
    const edges: any[] = [];

    result.records.forEach(record => {
      const node = record.get('n');
      const rel = record.get('r');
      const other = record.get('m');

      // Add nodes to map
      if (!nodeMap.has(node.properties.id)) {
        nodeMap.set(node.properties.id, {
          id: node.properties.id,
          label: node.properties.name,
          type: node.properties.type,
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
          size: Math.max(10, Math.min(30, 10 + (node.properties.importance || 0) * 20))
        });
      }

      if (other && !nodeMap.has(other.properties.id)) {
        nodeMap.set(other.properties.id, {
          id: other.properties.id,
          label: other.properties.name,
          type: other.properties.type,
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

      // Add relationship
      if (rel && other) {
        edges.push({
          id: rel.properties.id || `${node.properties.id}-${other.properties.id}`,
          source: node.properties.id,
          target: other.properties.id,
          kind: rel.properties.kind || 'relationship',
          weight: rel.properties.strength_score || 0.5,
          strength_score: rel.properties.strength_score || 0.5,
          interaction_count: rel.properties.interaction_count || 0
        });
      }
    });

    const nodes = Array.from(nodeMap.values());

    console.log(`✅ Progressive load: ${nodes.length} nodes, ${edges.length} edges`);

    return NextResponse.json({
      success: true,
      data: {
        nodes,
        edges
      },
      meta: {
        mode,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        centerNodeId,
        hasMore: nodes.length >= limit
      }
    });

  } catch (error) {
    console.error('Error in progressive load:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to load graph data progressively',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await session.close();
  }
}
