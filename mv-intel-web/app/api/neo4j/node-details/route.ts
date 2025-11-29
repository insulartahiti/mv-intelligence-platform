import { NextRequest, NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';
import pool from '../../../../lib/postgres';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get('id');

  if (!nodeId) {
    return NextResponse.json({
      success: false,
      message: 'Node ID is required'
    }, { status: 400 });
  }

  const session = driver.session({ database: NEO4J_DATABASE });

  try {
    console.log(`🔍 Fetching node details for: ${nodeId}`);

    // Get node details with all properties - try both id property and internal identity
    const nodeQuery = `
      MATCH (n:Entity)
      WHERE n.id = $nodeId OR id(n) = toInteger($nodeId)
      RETURN n
    `;

    const nodeResult = await session.run(nodeQuery, { nodeId });
    
    if (nodeResult.records.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Node not found'
      }, { status: 404 });
    }

    const node = nodeResult.records[0].get('n');
    const dbId = node.properties.id; // Get the Postgres UUID

    // --- FETCH RICH DATA FROM POSTGRES (using pg directly) ---
    let postgresData: any = {};
    if (dbId) {
      try {
        const client = await pool.connect();
        try {
            const res = await client.query(
                `SELECT business_analysis, enrichment_data, employment_history, publications, areas_of_expertise, enrichment_source 
                 FROM graph.entities 
                 WHERE id = $1`,
                [dbId]
            );
            
            if (res.rows.length > 0) {
                postgresData = res.rows[0];
            }
        } finally {
            client.release();
        }
      } catch (pgError) {
        console.warn(`Failed to fetch Postgres data for ${dbId}:`, pgError);
      }
    }
    // -------------------------------------

    const nodeData = {
      id: node.identity.toString(),
      label: node.properties.name || 'Unknown',
      group: node.labels[0] || 'Entity',
      properties: {
        ...node.properties,
        ...postgresData, // Merge rich data
        type: node.properties.type || node.labels[0] || 'Entity',
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

    // Get connected nodes and relationships
    // Logic: Group by connected node and pick the strongest relationship
    const connectionsQuery = `
      MATCH (n:Entity)-[r:RELATES]-(m:Entity)
      WHERE n.id = $nodeId OR id(n) = toInteger($nodeId)
      WITH m, r ORDER BY r.strength_score DESC
      WITH m, head(collect(r)) as bestRel
      RETURN m, bestRel as r
      ORDER BY m.importance DESC
      LIMIT 20
    `;

    const connectionsResult = await session.run(connectionsQuery, { nodeId });
    
    const connections = connectionsResult.records.map(record => {
      const connectedNode = record.get('m');
      const relationship = record.get('r');
      
      return {
        id: connectedNode.identity.toString(),
        label: connectedNode.properties.name || 'Unknown',
        type: connectedNode.labels[0] || 'Entity',
        relationship: {
          type: relationship.type,
          kind: relationship.properties.kind || relationship.type,
          strength: relationship.properties.strength_score || 0.5
        },
        properties: {
          importance: connectedNode.properties.importance || 0,
          is_internal: connectedNode.properties.is_internal || false,
          is_portfolio: connectedNode.properties.is_portfolio || false,
          is_pipeline: connectedNode.properties.is_pipeline || false,
          industry: connectedNode.properties.industry || '',
          domain: connectedNode.properties.domain || ''
        }
      };
    });

    // Get graph metrics for this node
    const metricsQuery = `
      MATCH (n:Entity)
      WHERE n.id = $nodeId OR id(n) = toInteger($nodeId)
      OPTIONAL MATCH (n)-[r:RELATES]-(m:Entity)
      RETURN 
        count(DISTINCT m) as degree,
        collect(DISTINCT m.type)[0..10] as neighborTypes,
        collect(DISTINCT r.type)[0..10] as relationshipTypes
    `;

    const metricsResult = await session.run(metricsQuery, { nodeId });
    const metrics = metricsResult.records[0];
    
    const nodeMetrics = {
      degree: metrics.get('degree').toNumber(),
      neighborTypes: metrics.get('neighborTypes'),
      relationshipTypes: metrics.get('relationshipTypes')
    };

    return NextResponse.json({
      success: true,
      data: {
        node: nodeData,
        connections,
        metrics: nodeMetrics
      }
    });

  } catch (error: any) {
    console.error('Error fetching node details:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch node details',
      error: error.message,
    }, { status: 500 });
  } finally {
    await session.close();
  }
}
