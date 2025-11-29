import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Affinity API configuration
const AFFINITY_API_KEY = process.env.AFFINITY_API_KEY;
const AFFINITY_BASE_URL = 'https://api.affinity.co';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

function basicAuthHeader() {
  if (!AFFINITY_API_KEY) {
    throw new Error('AFFINITY_API_KEY not configured');
  }
  const authString = ':' + AFFINITY_API_KEY;
  const encodedAuth = btoa(authString);
  return {
    'Authorization': `Basic ${encodedAuth}`,
    'Content-Type': 'application/json'
  };
}

interface ImportProgress {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  current_step: string;
  progress_percentage: number;
  organizations_processed: number;
  contacts_processed: number;
  errors: string[];
  results?: {
    organizations: any[];
    contacts: any[];
    total_organizations: number;
    total_contacts: number;
  };
}

// Store progress in memory (in production, use Redis or database)
const progressStore = new Map<string, ImportProgress>();

async function fetchAffinityData<T>(endpoint: string, params?: Record<string, string>): Promise<T[]> {
  const url = new URL(`${AFFINITY_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: basicAuthHeader()
  });

  if (!response.ok) {
    throw new Error(`Affinity API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (Array.isArray(data)) {
    return data;
  } else if (data.organizations) {
    return data.organizations;
  } else if (data.lists) {
    return data.lists;
  } else {
    return [];
  }
}

async function findListByName(listName: string): Promise<any> {
  try {
    const lists = await fetchAffinityData<any>('/lists');
    
    // Try exact match first
    let foundList = lists.find((list: any) => 
      list.name.toLowerCase() === listName.toLowerCase()
    );
    
    // If not found, try partial match
    if (!foundList) {
      foundList = lists.find((list: any) => 
        list.name.toLowerCase().includes(listName.toLowerCase()) ||
        listName.toLowerCase().includes(list.name.toLowerCase())
      );
    }
    
    // If still not found, try common variations
    if (!foundList) {
      const variations = [
        'Motive Ventures Pipeline',
        'Motive Ventures',
        'Pipeline',
        'Ventures Pipeline',
        'MV Pipeline'
      ];
      
      for (const variation of variations) {
        foundList = lists.find((list: any) => 
          list.name.toLowerCase().includes(variation.toLowerCase())
        );
        if (foundList) break;
      }
    }
    
    return foundList;
  } catch (error) {
    console.error('Error fetching lists:', error);
    return null;
  }
}

async function getOrganizationsInList(listId: number, limit: number = 50): Promise<any[]> {
  try {
    const maxPages = Math.ceil(limit / 50);
    const orgsInList = await fetchAllPages<any>('/organizations', { 
      list_id: listId.toString(),
      page_size: '50'
    }, maxPages);
    
    return orgsInList.slice(0, limit);
  } catch (error) {
    console.error('Error fetching organizations in list:', error);
    return [];
  }
}

async function fetchAllPages<T>(endpoint: string, params?: Record<string, string>, maxPages: number = 10): Promise<T[]> {
  let allData: T[] = [];
  let page = 1;
  const pageSize = 50;

  while (page <= maxPages) {
    try {
      const pageParams = { ...params, page: page.toString(), page_size: pageSize.toString() };
      const pageData = await fetchAffinityData<T>(endpoint, pageParams);
      
      if (pageData.length === 0) break;
      
      allData = allData.concat(pageData);
      page++;
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      break;
    }
  }

  return allData;
}

async function getOrganizationDetails(orgId: number): Promise<any> {
  try {
    const response = await fetch(`${AFFINITY_BASE_URL}/organizations/${orgId}`, {
      headers: basicAuthHeader()
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch organization ${orgId}: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching organization ${orgId}:`, error);
    return null;
  }
}

async function getPersonsForOrganization(orgId: number): Promise<any[]> {
  try {
    return await fetchAffinityData<any>('/persons', { organization_id: orgId.toString() });
  } catch (error) {
    console.error(`Error fetching persons for organization ${orgId}:`, error);
    return [];
  }
}

// Intelligent filtering for Motive Ventures Pipeline
function shouldImportOrganization(org: any): boolean {
  // Filter out organizations that are clearly not relevant
  const excludePatterns = [
    /motive\s+partners/i,
    /embedded\s+capital/i,
    /jigsaw\s+xyz/i,
    /test/i,
    /demo/i,
    /example/i
  ];
  
  const name = org.name?.toLowerCase() || '';
  const domain = org.domain?.toLowerCase() || '';
  
  // Skip if matches exclude patterns
  for (const pattern of excludePatterns) {
    if (pattern.test(name) || pattern.test(domain)) {
      return false;
    }
  }
  
  // Must have either a name or domain
  if (!name && !domain) {
    return false;
  }
  
  // Prefer organizations with domains (more likely to be real companies)
  if (domain && domain.includes('.')) {
    return true;
  }
  
  // Include organizations with substantial names
  if (name && name.length > 2) {
    return true;
  }
  
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      list_name = 'Motive Ventures Pipeline', 
      limit = 25,
      batch_size = 5,
      include_contacts = true,
      intelligent_filtering = true
    } = body;

    const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize progress
    const progress: ImportProgress = {
      status: 'pending',
      current_step: 'Initializing import...',
      progress_percentage: 0,
      organizations_processed: 0,
      contacts_processed: 0,
      errors: []
    };
    
    progressStore.set(importId, progress);

    // Start import process in background
    processImport(importId, list_name, limit, batch_size, include_contacts, intelligent_filtering);

    return NextResponse.json({
      status: 'success',
      message: 'Import started',
      import_id: importId,
      progress_url: `/api/affinity/import-entities/progress/${importId}`
    });

  } catch (error) {
    console.error('Error starting import:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to start import',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function processImport(
  importId: string, 
  listName: string, 
  limit: number, 
  batchSize: number,
  includeContacts: boolean,
  intelligentFiltering: boolean
) {
  const progress = progressStore.get(importId)!;
  
  try {
    progress.status = 'in_progress';
    progress.current_step = 'Finding Affinity list...';
    progress.progress_percentage = 5;
    progressStore.set(importId, progress);

    // Step 1: Find the list
    const list = await findListByName(listName);
    if (!list) {
      throw new Error(`List "${listName}" not found`);
    }

    progress.current_step = 'Fetching organizations from list...';
    progress.progress_percentage = 10;
    progressStore.set(importId, progress);

    // Step 2: Get organizations in the list
    const listEntries = await getOrganizationsInList(list.id, limit);
    
    // Apply intelligent filtering
    const filteredEntries = intelligentFiltering 
      ? listEntries.filter(shouldImportOrganization)
      : listEntries;

    progress.current_step = `Processing ${filteredEntries.length} organizations...`;
    progress.progress_percentage = 15;
    progressStore.set(importId, progress);

    const results = {
      organizations: [] as any[],
      contacts: [] as any[],
      total_organizations: filteredEntries.length,
      total_contacts: 0
    };

    // Step 3: Process organizations in batches
    const totalBatches = Math.ceil(filteredEntries.length / batchSize);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batch = filteredEntries.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
      
      progress.current_step = `Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} organizations)...`;
      progress.progress_percentage = 15 + (batchIndex / totalBatches) * 70;
      progressStore.set(importId, progress);

      for (const entry of batch) {
        try {
          const orgId = entry.id || entry.entity_id || entry.organization_id;
          if (!orgId) {
            progress.errors.push(`No organization ID found in entry: ${JSON.stringify(entry)}`);
            continue;
          }
          
          // Get organization details
          const orgDetails = await getOrganizationDetails(orgId);
          if (!orgDetails) {
            progress.errors.push(`Failed to fetch organization ${orgId}`);
            continue;
          }

          // Upsert organization to Supabase
          console.log(`Upserting company: ${orgDetails.name} (ID: ${orgDetails.id})`);
          
          const companyData = {
            name: orgDetails.name,
            domain: orgDetails.domain,
            affinity_org_id: orgDetails.id,
            industry: orgDetails.industry,
            company_type: orgDetails.company_type,
            website: orgDetails.website,
            description: orgDetails.description,
            employees: orgDetails.metadata?.employees,
            funding_stage: orgDetails.metadata?.funding_stage,
            revenue_range: orgDetails.metadata?.revenue_range,
            location: orgDetails.metadata?.location,
            tags: orgDetails.tags || [],
            last_synced_at: new Date().toISOString()
          };
          
          console.log('Company data:', JSON.stringify(companyData, null, 2));
          
          // Try using REST API directly to avoid schema cache issues
          let company;
          try {
            // First, try to find existing company
            const existingResponse = await fetch(`${SUPABASE_URL}/rest/v1/companies?affinity_org_id=eq.${orgDetails.id}`, {
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              }
            });
            
            const existingCompanies = await existingResponse.json();
            
            if (existingCompanies.length > 0) {
              // Update existing company
              const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${existingCompanies[0].id}`, {
                method: 'PATCH',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
                },
                body: JSON.stringify(companyData)
              });
              
              if (!updateResponse.ok) {
                throw new Error(`Update failed: ${updateResponse.statusText}`);
              }
              
              company = (await updateResponse.json())[0];
              console.log(`Updated existing company: ${company.name}`);
            } else {
              // Insert new company
              const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/companies`, {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
                },
                body: JSON.stringify(companyData)
              });
              
              if (!insertResponse.ok) {
                const errorText = await insertResponse.text();
                throw new Error(`Insert failed: ${insertResponse.statusText} - ${errorText}`);
              }
              
              company = (await insertResponse.json())[0];
              console.log(`Inserted new company: ${company.name}`);
            }
          } catch (apiError) {
            console.error(`REST API error:`, apiError);
            const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error';
            progress.errors.push(`Failed to upsert company ${orgDetails.name}: ${errorMessage}`);
            continue;
          }

          results.organizations.push({
            id: company.id,
            name: company.name,
            domain: company.domain,
            affinity_org_id: company.affinity_org_id
          });

          progress.organizations_processed++;

          // Get contacts if requested
          if (includeContacts) {
            const persons = await getPersonsForOrganization(orgDetails.id);
            
            for (const person of persons) {
              try {
                const { data: contact, error: contactError } = await supabase
                  .from('contacts')
                  .upsert({
                    name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
                    email: person.emails?.[0] || null,
                    title: person.title,
                    affinity_person_id: person.id,
                    company_id: company.id,
                    linkedin_url: person.linkedin_url,
                    tags: person.tags || [],
                    last_synced_at: new Date().toISOString()
                  }, {
                    onConflict: 'affinity_person_id'
                  })
                  .select()
                  .single();

                if (contactError) {
                  progress.errors.push(`Failed to upsert contact ${person.first_name} ${person.last_name}: ${contactError.message}`);
                  continue;
                }

                results.contacts.push({
                  id: contact.id,
                  name: contact.name,
                  email: contact.email,
                  title: contact.title,
                  company_id: contact.company_id,
                  affinity_person_id: contact.affinity_person_id
                });

                progress.contacts_processed++;

              } catch (personError) {
                const errorMessage = personError instanceof Error ? personError.message : 'Unknown error';
                progress.errors.push(`Error processing person ${person.id}: ${errorMessage}`);
              }
            }
          }

        } catch (orgError) {
          const errorMessage = orgError instanceof Error ? orgError.message : 'Unknown error';
          progress.errors.push(`Error processing organization ${entry.entity_id}: ${errorMessage}`);
        }
      }
    }

    // Complete the import
    progress.status = 'completed';
    progress.current_step = 'Import completed successfully';
    progress.progress_percentage = 100;
    progress.results = results;
    progressStore.set(importId, progress);

  } catch (error) {
    progress.status = 'failed';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    progress.current_step = `Import failed: ${errorMessage}`;
    progress.errors.push(errorMessage);
    progressStore.set(importId, progress);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('import_id');
    
    if (!importId) {
      return NextResponse.json({
        status: 'error',
        message: 'Import ID required'
      }, { status: 400 });
    }

    const progress = progressStore.get(importId);
    
    if (!progress) {
      return NextResponse.json({
        status: 'error',
        message: 'Import not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      status: 'success',
      progress
    });

  } catch (error) {
    console.error('Error getting import progress:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to get import progress',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


