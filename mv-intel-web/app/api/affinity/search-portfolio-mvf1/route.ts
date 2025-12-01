import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE || !AFFINITY_API_KEY) {
     return NextResponse.json({ 
       success: false, 
       error: 'Missing configuration' 
     }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { 
    auth: { persistSession: false } 
  });

  try {
    console.log('🔍 Starting intelligent Portfolio MVF1 search...');

    // 1. Find the Motive Ventures Pipeline list
    const listsResponse = await fetch(`${AFFINITY_BASE_URL}/lists`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!listsResponse.ok) {
      throw new Error(`Failed to fetch Affinity lists: ${listsResponse.statusText}`);
    }

    const lists = await listsResponse.json();
    const portfolioList = lists.find((list: any) => 
      list.name.toLowerCase().includes('motive ventures pipeline')
    );
    
    if (!portfolioList) {
      return NextResponse.json({
        success: false,
        error: 'Motive Ventures Pipeline list not found',
        availableLists: lists.map((l: any) => ({ id: l.id, name: l.name }))
      }, { status: 404 });
    }

    console.log(`✅ Found pipeline list: ${portfolioList.name} (ID: ${portfolioList.id})`);

    // 2. Use Affinity's search API to find organizations with specific criteria
    // We'll search for organizations that might be in Portfolio MVF1 status
    const searchQueries = [
      'Portfolio MVF1',
      'MVF1',
      'Portfolio',
      'Motive Ventures Fund 1'
    ];

    let allFoundOrgs = new Set();
    const searchResults = [];

    for (const query of searchQueries) {
      try {
        console.log(`🔍 Searching for: "${query}"`);
        
        // Search organizations with the query
        const searchResponse = await fetch(`${AFFINITY_BASE_URL}/organizations?term=${encodeURIComponent(query)}&limit=100`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const orgs = Array.isArray(searchData) ? searchData : (searchData.organizations || []);
          
          console.log(`📊 Found ${orgs.length} organizations for query: "${query}"`);
          
          for (const org of orgs) {
            if (!allFoundOrgs.has(org.id)) {
              allFoundOrgs.add(org.id);
              searchResults.push({
                ...org,
                searchQuery: query
              });
            }
          }
        }

        // Add delay between searches
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.warn(`Error searching for "${query}":`, error);
      }
    }

    console.log(`📊 Total unique organizations found: ${searchResults.length}`);

    // 3. Filter organizations that are actually in the Motive Ventures Pipeline list
    const pipelineOrgs = [];
    
    for (const org of searchResults) {
      try {
        // Check if this organization is in the Motive Ventures Pipeline list
        const listEntriesResponse = await fetch(`${AFFINITY_BASE_URL}/lists/${portfolioList.id}/list-entries?entity_id=${org.id}&entity_type=1`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        if (listEntriesResponse.ok) {
          const entriesData = await listEntriesResponse.json();
          const entries = Array.isArray(entriesData) ? entriesData : (entriesData.list_entries || []);
          
          if (entries.length > 0) {
            pipelineOrgs.push({
              ...org,
              listEntry: entries[0]
            });
            console.log(`✅ ${org.name} is in Motive Ventures Pipeline`);
          }
        }

        // Add delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.warn(`Error checking pipeline membership for ${org.name}:`, error);
      }
    }

    console.log(`📊 Organizations in pipeline: ${pipelineOrgs.length}`);

    // 4. For organizations in the pipeline, check their field values for Portfolio MVF1 status
    const portfolioMVF1Orgs = [];
    
    for (const org of pipelineOrgs) {
      try {
        // Get field values for this organization
        const fieldValuesResponse = await fetch(`${AFFINITY_BASE_URL}/field-values?organization_id=${org.id}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        if (fieldValuesResponse.ok) {
          const fieldValuesData = await fieldValuesResponse.json();
          const fieldValues = Array.isArray(fieldValuesData) ? fieldValuesData : (fieldValuesData.field_values || []);
          
          // Look for Portfolio MVF1 status (field_id: 1163869)
          const statusField = fieldValues.find((fv: any) => {
            if (fv.field_id === 1163869) {
              const value = fv.value;
              if (typeof value === 'string') {
                return value.toLowerCase().includes('portfolio') && 
                       value.toLowerCase().includes('mvf1');
              } else if (value && typeof value === 'object' && value.text) {
                return value.text.toLowerCase().includes('portfolio') && 
                       value.text.toLowerCase().includes('mvf1');
              }
            }
            return false;
          });
          
          if (statusField) {
            console.log(`✅ Found Portfolio MVF1: ${org.name} with status: ${JSON.stringify(statusField.value)}`);
            portfolioMVF1Orgs.push({
              ...org,
              status: statusField.value
            });
          }
        }

        // Add delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error) {
        console.warn(`Error checking field values for ${org.name}:`, error);
      }
    }

    console.log(`📊 Final Portfolio MVF1 organizations: ${portfolioMVF1Orgs.length}`);

    // 5. Store organizations in Supabase
    const results = {
      total: portfolioMVF1Orgs.length,
      imported: 0,
      updated: 0,
      errors: 0,
      organizations: [] as any[]
    };

    for (const org of portfolioMVF1Orgs) {
      const { data, error } = await supabase
        .from('companies')
        .upsert({
          affinity_org_id: org.id,
          name: org.name,
          domain: org.domain,
          industry: org.industry,
          last_synced_at: new Date().toISOString(),
          tags: ['Motive Ventures Pipeline', 'Portfolio MVF1']
        }, { onConflict: 'affinity_org_id' })
        .select()
        .single();

      if (error) {
        console.error(`Error upserting organization ${org.name}:`, error);
        results.errors++;
      } else if (data) {
        if (data.created_at === data.updated_at) {
          results.imported++;
        } else {
          results.updated++;
        }
        results.organizations.push({
          id: data.id,
          name: data.name,
          domain: data.domain,
          industry: data.industry
        });
      }
    }

    console.log('✅ Intelligent Portfolio MVF1 search completed:', results);

    return NextResponse.json({
      success: true,
      message: `Intelligent search found ${results.imported} new and updated ${results.updated} Portfolio MVF1 organizations`,
      results: results,
      searchStats: {
        totalSearched: searchResults.length,
        inPipeline: pipelineOrgs.length,
        portfolioMVF1: portfolioMVF1Orgs.length
      }
    });

  } catch (error) {
    console.error('❌ Intelligent search error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
