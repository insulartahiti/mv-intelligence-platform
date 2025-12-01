import { NextRequest, NextResponse } from 'next/server';
import { driver, NEO4J_DATABASE } from '../../../../lib/neo4j';
import { createClient } from '@supabase/supabase-js';


export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      success: false,
      message: 'Missing configuration'
    }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get('id');

  if (!nodeId) {
    return NextResponse.json({
      success: false,
      message: 'Node ID is required'
    }, { status: 400 });
  }

    // Verify driver is initialized
    if (!driver) {
        console.warn('Neo4j driver uninitialized');
        return NextResponse.json({
            success: false,
            message: 'Graph service unavailable'
        }, { status: 503 });
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

    // --- FETCH RICH DATA FROM POSTGRES (using Supabase Client) ---
    let postgresData: any = {};
    let interactions: any[] = [];
    let files: any[] = [];

    if (dbId) {
      try {
        // 1. Fetch Entity Enrichment
        const { data: entityData, error: entityError } = await supabase
            .schema('graph')
            .from('entities')
            .select('business_analysis, enrichment_data, employment_history, publications, areas_of_expertise, enrichment_source')
            .eq('id', dbId)
            .maybeSingle();
        
        if (entityData) {
            postgresData = entityData;
        } else if (entityError) {
            console.warn(`Failed to fetch Postgres data for ${dbId}:`, entityError.message);
        }

        // 2. Fetch Interactions (Emails, Meetings)
        try {
            const type = (node.properties.type || node.labels[0] || '').toLowerCase();
            let query = supabase.schema('graph').from('interactions').select('*').order('started_at', { ascending: false }).limit(50);
            
            if (type === 'organization') {
                query = query.eq('company_id', dbId);
            } else {
                // For person, we need to check if ID is in participants array.
                // Supabase filter for array contains: .contains('participants', [dbId]) ??
                // Actually 'participants' is text[] array. .cs (contains) works.
                query = query.contains('participants', [dbId]);
            }
            
            const { data: intData, error: intError } = await query;
            if (intData) interactions = intData;
            if (intError) console.warn('Interaction fetch error:', intError.message);

        } catch (err) {
            console.warn(`Failed to fetch interactions for ${dbId}:`, err);
        }

        // 3. Fetch Affinity Files
        try {
            const { data: filesData, error: filesError } = await supabase
                .schema('graph')
                .from('affinity_files')
                .select('id, name, url, size_bytes, ai_summary, created_at')
                .eq('entity_id', dbId)
                .order('created_at', { ascending: false })
                .limit(20);
            
            if (filesData) files = filesData;
            if (filesError) console.warn('Files fetch error:', filesError.message);

        } catch (err) {
            console.warn(`Failed to fetch files for ${dbId}:`, err);
        }

      } catch (err: any) {
        console.warn(`Failed to fetch extra data for ${dbId}:`, err.message);
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
        interactions,    // Add interactions
        files,           // Add files
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
