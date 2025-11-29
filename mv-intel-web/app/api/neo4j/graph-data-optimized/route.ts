import { NextRequest, NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 50000);
  const minImportance = parseFloat(searchParams.get('minImportance') || '0.1');
  const cursor = parseInt(searchParams.get('cursor') || '0', 10);
  const expandNodeId = searchParams.get('expandNodeId');
  const includeMetrics = searchParams.get('includeMetrics') === 'true';

  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log(`🔍 Optimized Neo4j query: limit=${limit}, minImportance=${minImportance}, cursor=${cursor}, expandNodeId=${expandNodeId}`);

    let query: string;
    let params: any;

    if (expandNodeId) {
      // Expand specific node - get its neighbors with centrality
      query = `
        MATCH (n:Entity {id: $expandNodeId})
        MATCH (n)-[r:RELATES]-(m:Entity)
        WHERE m.importance >= $minImportance OR m.is_internal = true
        WITH n, r, m
        ORDER BY m.importance DESC, m.name ASC
        LIMIT $limit
        RETURN n, r, m
        UNION
        MATCH (n:Entity)
        WHERE n.importance >= $minImportance OR n.is_internal = true
        WITH n
        ORDER BY n.importance DESC, n.name ASC
        SKIP $cursor
        LIMIT $limit
        MATCH (n)-[r:RELATES]-(m:Entity)
        WHERE m.importance >= $minImportance OR m.is_internal = true
        RETURN n, r, m
      `;
      params = {
        minImportance: minImportance,
        cursor: neo4j.int(cursor),
        limit: neo4j.int(limit),
        expandNodeId: expandNodeId
      };
    } else {
      // Initial load or pagination with optimized query
      // First try to get entities with relationships
      query = `
        MATCH (n:Entity)
        WHERE n.importance >= $minImportance OR n.is_internal = true
        WITH n
        ORDER BY n.importance DESC, n.name ASC
        SKIP $cursor
        LIMIT $limit
        OPTIONAL MATCH (n)-[r:RELATES]-(m:Entity)
        WHERE m.importance >= $minImportance OR m.is_internal = true
        RETURN n, r, m
        ORDER BY n.importance DESC, m.importance DESC
      `;
      params = {
        minImportance: minImportance,
        cursor: neo4j.int(cursor),
        limit: neo4j.int(limit)
      };
    }

    const result = await session.run(query, params);

    // Process results efficiently
    const nodes: any[] = [];
    const edges: any[] = [];
    const nodeMap = new Map();
    const edgeMap = new Map();

    result.records.forEach(record => {
      const node = record.get('n');
      const rel = record.get('r');
      const targetNode = record.get('m');

      // Add source node (always add it even if there's no relationship)
      if (!nodeMap.has(node.identity.toString())) {
        const nodeData = {
          id: node.identity.toString(),
          label: node.properties.name || 'Unknown',
          group: node.labels[0] || 'Entity',
          properties: {
            ...node.properties,
            type: node.labels[0] || 'Entity',
            importance: node.properties.importance || 0,
            is_internal: node.properties.is_internal || false,
            is_portfolio: node.properties.is_portfolio || false,
            is_pipeline: node.properties.is_pipeline || false,
            pipeline_stage: node.properties.pipeline_stage || '',
            industry: node.properties.industry || '',
            domain: node.properties.domain || '',
            linkedin_url: node.properties.linkedin_url || '',
            linkedin_first_degree: node.properties.linkedin_first_degree || false
          }
        };
        nodes.push(nodeData);
        nodeMap.set(node.identity.toString(), nodeData);
      }

      // Add target node only if it exists (relationship exists)
      if (targetNode && !nodeMap.has(targetNode.identity.toString())) {
        const targetNodeData = {
          id: targetNode.identity.toString(),
          label: targetNode.properties.name || 'Unknown',
          group: targetNode.labels[0] || 'Entity',
          properties: {
            ...targetNode.properties,
            type: targetNode.labels[0] || 'Entity',
            importance: targetNode.properties.importance || 0,
            is_internal: targetNode.properties.is_internal || false,
            is_portfolio: targetNode.properties.is_portfolio || false,
            is_pipeline: targetNode.properties.is_pipeline || false,
            pipeline_stage: targetNode.properties.pipeline_stage || '',
            industry: targetNode.properties.industry || '',
            domain: targetNode.properties.domain || '',
            linkedin_url: targetNode.properties.linkedin_url || '',
            linkedin_first_degree: targetNode.properties.linkedin_first_degree || false
          }
        };
        nodes.push(targetNodeData);
        nodeMap.set(targetNode.identity.toString(), targetNodeData);
      }

      // Add edge only if relationship exists (avoid duplicates)
      if (rel && !edgeMap.has(rel.identity.toString())) {
        const edgeData = {
          id: rel.identity.toString(),
          from: node.identity.toString(),
          to: targetNode.identity.toString(),
          label: rel.type,
          properties: {
            kind: rel.properties.kind || rel.type,
            weight: rel.properties.weight || rel.properties.strength_score || 0.5,
            strength_score: rel.properties.strength_score || 0.5
          }
        };
        edges.push(edgeData);
        edgeMap.set(rel.identity.toString(), edgeData);
      }
    });

    // Get total count for pagination (optimized)
    const countQuery = `
      MATCH (n:Entity)
      WHERE n.importance >= $minImportance OR n.is_internal = true
      RETURN count(n) as total
    `;
    const countResult = await session.run(countQuery, { minImportance: minImportance });
    const totalNodes = countResult.records[0]?.get('total').toNumber() || 0;

    // Calculate pagination info
    const nextCursor = cursor + limit;
    const hasMore = nextCursor < totalNodes;

    // Get graph metrics if requested
    let metrics = null;
    if (includeMetrics && nodes.length > 0) {
      const nodeIds = nodes.map(n => n.id);
      const metricsQuery = `
        MATCH (n:Entity)
        WHERE n.id IN $nodeIds
        WITH n
        MATCH (n)-[r:RELATES]-(m:Entity)
        RETURN 
          n.id as nodeId,
          count(r) as degree,
          collect(DISTINCT m.type)[0..5] as neighborTypes
      `;
      const metricsResult = await session.run(metricsQuery, { nodeIds });
      metrics = metricsResult.records.map(record => ({
        nodeId: record.get('nodeId'),
        degree: record.get('degree').toNumber(),
        neighborTypes: record.get('neighborTypes')
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        nodes,
        edges,
        meta: {
          totalNodes: nodes.length,
          totalEdges: edges.length,
          limit,
          minImportance,
          cursor,
          nextCursor: hasMore ? nextCursor : null,
          hasMore,
          totalAvailable: totalNodes,
          expandedNode: expandNodeId || null
        },
        metrics
      }
    });

  } catch (error: any) {
    console.error('Error fetching optimized Neo4j data:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch Neo4j data',
      error: error.message,
    }, { status: 500 });
  } finally {
    await session.close();
  }
}
