import { NextRequest, NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get('entityId');
  const maxDepth = parseInt(searchParams.get('maxDepth') || '3', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  if (!entityId) {
    return NextResponse.json({
      success: false,
      message: 'Entity ID is required'
    }, { status: 400 });
  }

  // Get driver instance (might be null if env vars missing)
  const drv = typeof driver === 'function' ? driver() : driver;
  
  if (!drv) {
     return NextResponse.json({
      success: false,
      message: 'Neo4j driver not initialized'
    }, { status: 500 });
  }

  const session = drv.session({ database: NEO4J_DATABASE });

  try {
    console.log(`🔍 Finding intro paths for entity: ${entityId}, maxDepth: ${maxDepth}`);

    // Find introduction paths using variable length relationships
    const pathsQuery = `
      MATCH path = (start:Entity)-[*1..${maxDepth}]-(end:Entity)
      WHERE (start.id = $entityId OR id(start) = toInteger($entityId))
        AND (end.is_internal = true OR end.is_portfolio = true)
      WITH path, length(path) as pathLength
      ORDER BY pathLength ASC, end.importance DESC
      LIMIT ${limit}
      RETURN path, pathLength
    `;

    const pathsResult = await session.run(pathsQuery, { entityId });
    
    const introPaths = pathsResult.records.map(record => {
      const path = record.get('path');
      const pathLength = record.get('pathLength').toNumber();
      
      const formatNode = (node: any) => ({
        id: node.identity.toString(),
        label: node.properties.name || 'Unknown',
        type: node.labels[0] || 'Entity',
        properties: {
          importance: node.properties.importance || 0,
          is_internal: node.properties.is_internal || false,
          is_portfolio: node.properties.is_portfolio || false,
          is_pipeline: node.properties.is_pipeline || false,
          industry: node.properties.industry || '',
          domain: node.properties.domain || ''
        }
      });

      const nodes = [formatNode(path.start)];
      path.segments.forEach((segment: any) => {
        nodes.push(formatNode(segment.end));
      });

      const relationships = path.segments.map((segment: any) => ({
        type: segment.relationship.type,
        kind: segment.relationship.properties.kind || segment.relationship.type,
        strength: segment.relationship.properties.strength_score || 0.5
      }));

      return {
        pathLength,
        nodes,
        relationships,
        targetNode: nodes[nodes.length - 1]
      };
    });

    // Get direct connections to internal/portfolio entities
    const directConnectionsQuery = `
      MATCH (start:Entity)-[r:RELATES]-(end:Entity)
      WHERE (start.id = $entityId OR id(start) = toInteger($entityId))
        AND (end.is_internal = true OR end.is_portfolio = true)
      RETURN end, r
      ORDER BY end.importance DESC
      LIMIT 5
    `;

    const directResult = await session.run(directConnectionsQuery, { entityId });
    
    const directConnections = directResult.records.map(record => {
      const node = record.get('end');
      const relationship = record.get('r');
      
      return {
        id: node.identity.toString(),
        label: node.properties.name || 'Unknown',
        type: node.labels[0] || 'Entity',
        relationship: {
          type: relationship.type,
          kind: relationship.properties.kind || relationship.type,
          strength: relationship.properties.strength_score || 0.5
        },
        properties: {
          importance: node.properties.importance || 0,
          is_internal: node.properties.is_internal || false,
          is_portfolio: node.properties.is_portfolio || false,
          is_pipeline: node.properties.is_pipeline || false,
          industry: node.properties.industry || '',
          domain: node.properties.domain || ''
        }
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        introPaths,
        directConnections,
        totalPaths: introPaths.length,
        totalDirect: directConnections.length
      }
    });

  } catch (error: any) {
    console.error('Error finding intro paths:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to find intro paths',
      error: error.message,
    }, { status: 500 });
  } finally {
    await session.close();
  }
}
