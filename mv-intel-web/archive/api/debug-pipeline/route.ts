import { NextRequest, NextResponse } from 'next/server';

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY!;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Debugging Affinity pipeline structure...');
    
    // Get Motive Ventures Pipeline list
    const listsResponse = await fetch(`${AFFINITY_BASE_URL}/lists`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const lists = await listsResponse.json();
    const pipelineList = lists.find((list: any) => 
      list.name.toLowerCase().includes('motive ventures pipeline')
    );

    if (!pipelineList) {
      return NextResponse.json({ error: 'Pipeline list not found' });
    }

    // Get first few list entries
    const entriesResponse = await fetch(`${AFFINITY_BASE_URL}/lists/${pipelineList.id}/list-entries?limit=5`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const entriesData = await entriesResponse.json();
    const entries = Array.isArray(entriesData) ? entriesData : (entriesData.list_entries || []);

    // Try to determine what type of entities these are
    const entityTypes = [];
    
    for (const entry of entries.slice(0, 3)) {
      const entityId = entry.entity_id;
      
      // Try different entity types
      const entityTypesToTry = ['opportunities', 'organizations', 'persons', 'deals'];
      
      for (const entityType of entityTypesToTry) {
        try {
          const response = await fetch(`${AFFINITY_BASE_URL}/${entityType}/${entityId}`, {
            headers: {
              'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const entity = await response.json();
            entityTypes.push({
              entity_id: entityId,
              type: entityType,
              data: {
                id: entity.id,
                name: entity.name || entity.title || 'Unknown',
                status: entity.status,
                stage: entity.stage,
                pipeline_stage: entity.pipeline_stage
              }
            });
            console.log(`✅ Found ${entityType} for entity ${entityId}:`, entity.name || entity.title);
            break; // Found the right type, move to next entity
          }
        } catch (error) {
          // Continue to next entity type
        }
      }
    }

    return NextResponse.json({
      success: true,
      pipelineList: {
        id: pipelineList.id,
        name: pipelineList.name
      },
      totalEntries: entries.length,
      sampleEntries: entries.slice(0, 2),
      entityTypes: entityTypes
    });

  } catch (error) {
    console.error('❌ Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
