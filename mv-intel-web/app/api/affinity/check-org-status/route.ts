import { NextRequest, NextResponse } from 'next/server';

const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY!;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Checking organization status fields...');
    
    // Get all lists to look for Portfolio MVF1
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
    
    // Look for lists that might contain Portfolio MVF1
    const portfolioLists = lists.filter((list: any) => 
      list.name.toLowerCase().includes('portfolio') || 
      list.name.toLowerCase().includes('mvf1') ||
      list.name.toLowerCase().includes('mvf')
    );
    
    console.log('🔍 Portfolio-related lists:', portfolioLists.map((l: any) => ({ id: l.id, name: l.name })));

    // Get first few list entries
    const entriesResponse = await fetch(`${AFFINITY_BASE_URL}/lists/${pipelineList.id}/list-entries?limit=10`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const entriesData = await entriesResponse.json();
    const entries = Array.isArray(entriesData) ? entriesData : (entriesData.list_entries || []);

    // Check organization details and field values
    const orgAnalysis = [];
    
    for (const entry of entries.slice(0, 5)) {
      try {
        const orgId = entry.entity_id;
        
        // Get organization details
        const orgResponse = await fetch(`${AFFINITY_BASE_URL}/organizations/${orgId}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        if (orgResponse.ok) {
          const org = await orgResponse.json();
          
          // Get field values for this organization in this list
          const fieldValuesResponse = await fetch(`${AFFINITY_BASE_URL}/field-values?entity_id=${orgId}&list_id=${pipelineList.id}`, {
            headers: {
              'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
              'Content-Type': 'application/json'
            }
          });

          let fieldValues = [];
          if (fieldValuesResponse.ok) {
            const fieldData = await fieldValuesResponse.json();
            fieldValues = Array.isArray(fieldData) ? fieldData : (fieldData.field_values || []);
          }

          orgAnalysis.push({
            organization: {
              id: org.id,
              name: org.name,
              domain: org.domain,
              status: org.status,
              stage: org.stage,
              pipeline_stage: org.pipeline_stage
            },
            fieldValues: fieldValues.map((fv: any) => ({
              field_name: fv.field_name,
              value: fv.value,
              field_id: fv.field_id
            }))
          });
        }
      } catch (error) {
        console.warn(`Error checking organization ${entry.entity_id}:`, error);
      }
    }

    // Analyze all field names and values
    const allFieldNames = [...new Set(orgAnalysis.flatMap(org => org.fieldValues.map((fv: any) => fv.field_name)).filter(Boolean))];
    const allFieldValues = [...new Set(orgAnalysis.flatMap(org => org.fieldValues.map((fv: any) => fv.value)).filter(Boolean))];
    
    const statusFields = orgAnalysis.flatMap(org => org.fieldValues).filter((fv: any) => 
      fv.field_name && (
        fv.field_name.toLowerCase().includes('status') ||
        fv.field_name.toLowerCase().includes('stage') ||
        fv.field_name.toLowerCase().includes('pipeline')
      )
    );

    return NextResponse.json({
      success: true,
      pipelineList: {
        id: pipelineList.id,
        name: pipelineList.name
      },
      portfolioLists: portfolioLists.map((l: any) => ({ id: l.id, name: l.name })),
      orgAnalysis: orgAnalysis,
      allFieldNames: allFieldNames,
      allFieldValues: allFieldValues,
      statusFields: statusFields,
      uniqueStatusValues: [...new Set(statusFields.map(f => f.value).filter(Boolean))]
    });

  } catch (error) {
    console.error('❌ Organization status check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
