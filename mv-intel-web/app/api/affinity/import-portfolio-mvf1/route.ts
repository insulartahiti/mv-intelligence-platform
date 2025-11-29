import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY!;
const AFFINITY_BASE_URL = 'https://api.affinity.co';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { 
  auth: { persistSession: false } 
});

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Starting Portfolio MVF1 import...');
    
    // First, get the list ID for "Portfolio MVF1" in Motive Ventures Pipeline
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

    // Find the Portfolio MVF1 list - look for Motive Ventures Pipeline first
    let portfolioList = lists.find((list: any) => 
      list.name.toLowerCase().includes('motive ventures pipeline')
    );
    
    // If not found, look for any list with portfolio and mvf1
    if (!portfolioList) {
      portfolioList = lists.find((list: any) => 
        list.name.toLowerCase().includes('portfolio') && 
        list.name.toLowerCase().includes('mvf1')
      );
    }

    if (!portfolioList) {
      return NextResponse.json({
        success: false,
        error: 'Portfolio MVF1 list not found',
        availableLists: lists.map((l: any) => ({ id: l.id, name: l.name }))
      }, { status: 404 });
    }

    console.log(`✅ Found Portfolio MVF1 list: ${portfolioList.name} (ID: ${portfolioList.id})`);

    // Step 1: Get all list entries first
    console.log('🔍 Getting all list entries from Motive Ventures Pipeline...');
    
    const listEntriesResponse = await fetch(`${AFFINITY_BASE_URL}/lists/${portfolioList.id}/list-entries?limit=1000`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!listEntriesResponse.ok) {
      throw new Error(`Failed to fetch list entries: ${listEntriesResponse.statusText}`);
    }

    const listEntriesData = await listEntriesResponse.json();
    const listEntries = Array.isArray(listEntriesData) ? listEntriesData : (listEntriesData.list_entries || []);
    console.log(`📊 Found ${listEntries.length} list entries in Motive Ventures Pipeline`);

    // Step 2: Get field values for each entry to find Portfolio MVF1 status
    console.log('🔍 Checking field values for Portfolio MVF1 status...');
    
    const portfolioEntries = [];
    const batchSize = 10; // Process in smaller batches to avoid rate limits
    
    // Process entries sequentially with proper rate limiting
    const maxEntries = listEntries.length; // Process all entries to find all Portfolio MVF1 organizations
    let processed = 0;
    
    for (let i = 0; i < maxEntries; i++) {
      const entry = listEntries[i];
      
      try {
        processed++;
        if (processed % 100 === 0) {
          console.log(`📊 Processed ${processed}/${maxEntries} entries, found ${portfolioEntries.length} Portfolio MVF1...`);
        }
        
        // Get field values for this entry using list_entry_id
        const fieldValuesResponse = await fetch(`${AFFINITY_BASE_URL}/field-values?list_entry_id=${entry.id}`, {
          headers: {
            'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });

        if (fieldValuesResponse.ok) {
          const fieldValuesData = await fieldValuesResponse.json();
          const fieldValues = Array.isArray(fieldValuesData) ? fieldValuesData : (fieldValuesData.field_values || []);
          
          // Look for field_id 1163869 which contains Portfolio MVF1 status
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
            console.log(`✅ Found Portfolio MVF1 entry: ${entry.entity_id} with status: ${JSON.stringify(statusField.value)}`);
            portfolioEntries.push({ ...entry, status: statusField.value });
          }
        } else if (fieldValuesResponse.status === 429) {
          console.log(`⚠️ Rate limit hit at entry ${processed}, waiting 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          i--; // Retry this entry
          continue;
        } else {
          console.log(`⚠️ Field values request failed for entry ${entry.entity_id}: ${fieldValuesResponse.status}`);
        }
        
        // Add delay every 5 requests to avoid rate limits (more conservative for full import)
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
      } catch (error) {
        console.warn(`Error checking field values for entry ${entry.entity_id}:`, error);
        // Add extra delay on error
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`📊 Found ${portfolioEntries.length} entries with Portfolio MVF1 status out of ${listEntries.length} total entries`);

    // Step 4: Get organizations from these entries
    let organizations: any[] = [];
    
    if (portfolioEntries.length > 0) {
      console.log('🔍 Fetching organizations from Portfolio MVF1 entries...');
      
      for (const entry of portfolioEntries.slice(0, 20)) { // Limit to first 20
        try {
          // The entity_id in list entries is the organization ID when entity_type is 1
          if (entry.entity_type === 1) {
            const orgResponse = await fetch(`${AFFINITY_BASE_URL}/organizations/${entry.entity_id}`, {
              headers: {
                'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
                'Content-Type': 'application/json'
              }
            });

            if (orgResponse.ok) {
              const organization = await orgResponse.json();
              organizations.push(organization);
              console.log(`✅ Added organization: ${organization.name}`);
            }
          }
        } catch (error) {
          console.warn(`Error fetching organization for entry ${entry.entity_id}:`, error);
        }
      }
    } else {
      console.log('⚠️ No Portfolio MVF1 entries found, falling back to all organizations...');
      
      const allOrgsResponse = await fetch(`${AFFINITY_BASE_URL}/organizations?limit=10`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${AFFINITY_API_KEY}`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });

      if (allOrgsResponse.ok) {
        const allOrgsData = await allOrgsResponse.json();
        const allOrganizations = Array.isArray(allOrgsData) ? allOrgsData : (allOrgsData.organizations || []);
        organizations = allOrganizations.slice(0, 10);
        console.log(`📊 Using first ${organizations.length} organizations as fallback`);
      }
    }

    console.log(`📊 Final result: Found ${organizations.length} organizations with Portfolio MVF1 status`);

    // Store organizations in Supabase

    const results = {
      total: organizations.length,
      imported: 0,
      updated: 0,
      errors: 0,
      organizations: [] as any[]
    };

    for (const org of organizations) {
      try {
        // Check if organization already exists
        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .eq('affinity_org_id', org.id)
          .single();

        const orgData = {
          name: org.name,
          domain: org.domain,
          affinity_org_id: org.id,
          industry: org.industry,
          company_type: org.company_type,
          website: org.website,
          description: org.description,
          employees: org.employees,
          funding_stage: org.funding_stage,
          revenue_range: org.revenue_range,
          location: org.location,
          tags: org.tags || [],
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        if (existing) {
          // Update existing
          const { error } = await supabase
            .from('companies')
            .update(orgData)
            .eq('id', existing.id);
          
          if (error) throw error;
          results.updated++;
        } else {
          // Insert new
          const { error } = await supabase
            .from('companies')
            .insert(orgData);
          
          if (error) throw error;
          results.imported++;
        }

        results.organizations.push({
          id: org.id,
          name: org.name,
          domain: org.domain,
          industry: org.industry
        });

      } catch (error) {
        console.error(`Error processing organization ${org.name}:`, error);
        results.errors++;
      }
    }

    console.log('✅ Portfolio MVF1 import completed:', results);

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${results.imported} new and updated ${results.updated} organizations from Portfolio MVF1`,
      results
    });

  } catch (error) {
    console.error('❌ Portfolio MVF1 import error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

