import { NextRequest, NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';
import neo4j from 'neo4j-driver'; // Import neo4j for integer types

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 2000); // Cap at 2000
    const limitInt = Math.floor(Number(limit)); // Ensure integer
    const minImportance = parseFloat(searchParams.get('minImportance') || '0.1');
    const cursor = searchParams.get('cursor') || '0';
    const expandNodeId = searchParams.get('expandNodeId');

    // Verify driver is initialized
    if (!driver) {
       // Return empty dataset instead of crashing to prevent UI error flash
       return NextResponse.json({
         success: true,
         data: {
           nodes: [],
           edges: [],
           meta: { totalNodes: 0, totalEdges: 0, limit: limitInt, minImportance }
         }
       });
    }

    const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log(`🔍 Fetching Neovis data: limit=${limitInt}, minImportance=${minImportance}, cursor=${cursor}, expandNodeId=${expandNodeId}`);

    let query: string;
    let params: any;

    if (expandNodeId) {
      // Expand specific node - get its neighbors
      query = `
        MATCH (n:Entity)
        WHERE n.importance >= $minImportance OR n.is_internal = true
        WITH n
        ORDER BY n.importance DESC, n.name ASC
        SKIP $cursor
        LIMIT $limit
        MATCH (n)-[r:RELATES]-(m:Entity)
        WHERE m.importance >= $minImportance OR m.is_internal = true
        RETURN n, r, m
        UNION
        MATCH (n:Entity {id: $expandNodeId})
        MATCH (n)-[r:RELATES]-(m:Entity)
        WHERE m.importance >= $minImportance OR m.is_internal = true
        RETURN n, r, m
      `;
      params = { 
        minImportance: Number(minImportance),
        cursor: neo4j.int(Number(cursor)), // Use neo4j.int for integers
        limit: neo4j.int(limitInt),        // Use neo4j.int for integers
        expandNodeId: expandNodeId
      };
    } else {
      // Initial load or pagination
      query = `
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
        minImportance: Number(minImportance),
        cursor: neo4j.int(Number(cursor)),
        limit: neo4j.int(limitInt)
      };
    }

    const result = await session.run(query, params);

    // Process results for Neovis.js format
    const nodes: any[] = [];
    const edges: any[] = [];
    const nodeMap = new Map();

    result.records.forEach(record => {
      const node = record.get('n');
      const rel = record.get('r');
      const targetNode = record.get('m');

      // Add source node
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
            industry: node.properties.industry || '',
            domain: node.properties.domain || ''
          }
        };
        nodes.push(nodeData);
        nodeMap.set(node.identity.toString(), nodeData);
      }

      // Add target node
      if (!nodeMap.has(targetNode.identity.toString())) {
        const targetNodeData = {
          id: targetNode.identity.toString(),
          label: targetNode.properties.name || 'Unknown',
          group: targetNode.labels[0] || 'Entity',
          properties: {
            ...targetNode.properties,
            type: targetNode.labels[0] || 'Entity',
            importance: targetNode.properties.importance || 0,
            is_internal: targetNode.properties.is_internal || false,
            industry: targetNode.properties.industry || '',
            domain: targetNode.properties.domain || ''
          }
        };
        nodes.push(targetNodeData);
        nodeMap.set(targetNode.identity.toString(), targetNodeData);
      }

      // Add edge
      if (rel) {
        edges.push({
          id: rel.identity.toString(),
          from: node.identity.toString(),
          to: targetNode.identity.toString(),
          label: rel.type,
          properties: {
            kind: rel.properties.kind || rel.type,
            weight: rel.properties.weight || rel.properties.strength_score || 0.5,
            strength_score: rel.properties.strength_score || 0.5
          }
        });
      }
    });

    // Get total count for pagination
    const countQuery = `
      MATCH (n:Entity)
      WHERE n.importance >= $minImportance OR n.is_internal = true
      RETURN count(n) as total
    `;
    const countResult = await session.run(countQuery, { minImportance: Number(minImportance) });
    const totalNodes = countResult.records[0]?.get('total') || 0;

    const nextCursor = Number(cursor) + limitInt;
    const hasMore = nextCursor < totalNodes;

    return NextResponse.json({
      success: true,
      data: {
        nodes,
        edges,
        meta: {
          totalNodes: nodes.length,
          totalEdges: edges.length,
          limit: limitInt,
          minImportance,
          cursor: Number(cursor),
          nextCursor: hasMore ? nextCursor : null,
          hasMore,
          totalAvailable: totalNodes
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching Neovis data:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch Neovis data',
      error: error.message,
    }, { status: 500 });
  } finally {
    await session.close();
  }
}