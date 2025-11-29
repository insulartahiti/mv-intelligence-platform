import { NextRequest, NextResponse } from 'next/server';

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY!;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Testing Affinity pipeline status functionality...');
    
    // 1. Get all lists
    const listsResponse = await fetch(`${AFFINITY_BASE_URL}/lists`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!listsResponse.ok) {
      throw new Error(`Failed to fetch lists: ${listsResponse.statusText}`);
    }

    const lists = await listsResponse.json();
    console.log('📋 Available lists:', lists.map((l: any) => ({ id: l.id, name: l.name })));

    // Find Motive Ventures Pipeline
    const pipelineList = lists.find((list: any) => 
      list.name.toLowerCase().includes('motive ventures pipeline')
    );

    if (!pipelineList) {
      return NextResponse.json({
        success: false,
        error: 'Motive Ventures Pipeline list not found',
        availableLists: lists.map((l: any) => ({ id: l.id, name: l.name }))
      });
    }

    console.log(`✅ Found pipeline list: ${pipelineList.name} (ID: ${pipelineList.id})`);

    // 2. Get list entries
    const entriesResponse = await fetch(`${AFFINITY_BASE_URL}/lists/${pipelineList.id}/list-entries?limit=10`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!entriesResponse.ok) {
      throw new Error(`Failed to fetch list entries: ${entriesResponse.statusText}`);
    }

    const entriesData = await entriesResponse.json();
    const entries = Array.isArray(entriesData) ? entriesData : (entriesData.list_entries || []);
    console.log(`📊 Found ${entries.length} list entries`);
    
    // Debug: Check structure of first entry
    if (entries.length > 0) {
      console.log('🔍 First entry structure:', JSON.stringify(entries[0], null, 2));
    }

    // 3. Check opportunity details directly for first few entries
    const opportunityAnalysis = [];
    
    for (const entry of entries.slice(0, 3)) {
      try {
        console.log(`🔍 Checking opportunity details for entry ${entry.entity_id}...`);
        
        // Try to get opportunity details directly
        const opportunityResponse = await fetch(`${AFFINITY_BASE_URL}/opportunities/${entry.entity_id}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        console.log(`Opportunity response status: ${opportunityResponse.status}`);
        
        if (opportunityResponse.ok) {
          const opportunity = await opportunityResponse.json();
          console.log(`Opportunity data structure:`, Object.keys(opportunity));
          console.log(`Opportunity status/stage fields:`, {
            status: opportunity.status,
            stage: opportunity.stage,
            pipeline_stage: opportunity.pipeline_stage,
            current_stage: opportunity.current_stage
          });
          
          opportunityAnalysis.push({
            entity_id: entry.entity_id,
            opportunity: {
              id: opportunity.id,
              name: opportunity.name,
              status: opportunity.status,
              stage: opportunity.stage,
              pipeline_stage: opportunity.pipeline_stage,
              current_stage: opportunity.current_stage,
              organization_id: opportunity.organization_id
            }
          });
        } else {
          console.log(`Opportunity request failed: ${opportunityResponse.status} ${opportunityResponse.statusText}`);
        }
      } catch (error) {
        console.warn(`Error checking opportunity for entry ${entry.entity_id}:`, error);
      }
    }

    // 4. Analyze opportunity status/stage fields
    const allStatusValues = opportunityAnalysis.flatMap(entry => [
      entry.opportunity.status,
      entry.opportunity.stage,
      entry.opportunity.pipeline_stage,
      entry.opportunity.current_stage
    ]).filter(Boolean);

    const uniqueStatusValues = [...new Set(allStatusValues)];

    return NextResponse.json({
      success: true,
      pipelineList: {
        id: pipelineList.id,
        name: pipelineList.name
      },
      entriesCount: entries.length,
      opportunityAnalysis: opportunityAnalysis,
      uniqueStatusValues: uniqueStatusValues,
      allStatusFields: {
        status: [...new Set(opportunityAnalysis.map(e => e.opportunity.status).filter(Boolean))],
        stage: [...new Set(opportunityAnalysis.map(e => e.opportunity.stage).filter(Boolean))],
        pipeline_stage: [...new Set(opportunityAnalysis.map(e => e.opportunity.pipeline_stage).filter(Boolean))],
        current_stage: [...new Set(opportunityAnalysis.map(e => e.opportunity.current_stage).filter(Boolean))]
      }
    });

  } catch (error) {
    console.error('❌ Pipeline test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
