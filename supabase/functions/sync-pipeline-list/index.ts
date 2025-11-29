import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mv-signature',
}

// Affinity API configuration
const AFFINITY_API_KEY = Deno.env.get('AFFINITY_API_KEY')
const AFFINITY_BASE_URL = 'https://api.affinity.co'

function basicAuthHeader() {
  if (!AFFINITY_API_KEY) {
    throw new Error('AFFINITY_API_KEY not configured')
  }
  // Use the same format as the working deck capture functions
  const authString = ':' + AFFINITY_API_KEY
  const encodedAuth = btoa(authString)
  return {
    'Authorization': `Basic ${encodedAuth}`,
    'Content-Type': 'application/json'
  }
}

async function fetchAffinityData<T>(endpoint: string, params?: Record<string, string>): Promise<T[]> {
  const url = new URL(`${AFFINITY_BASE_URL}${endpoint}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }

  const response = await fetch(url.toString(), {
    headers: basicAuthHeader()
  })

  if (!response.ok) {
    throw new Error(`Affinity API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  
  // Handle different response formats
  if (Array.isArray(data)) {
    return data
  } else if (data.organizations) {
    return data.organizations
  } else if (data.lists) {
    return data.lists
  } else {
    return []
  }
}

async function fetchAllPages<T>(endpoint: string, params?: Record<string, string>, maxPages: number = 10): Promise<T[]> {
  let allData: T[] = []
  let page = 1
  const pageSize = 50

  while (page <= maxPages) {
    try {
      const pageParams = { ...params, page: page.toString(), page_size: pageSize.toString() }
      const pageData = await fetchAffinityData<T>(endpoint, pageParams)
      
      if (pageData.length === 0) break
      
      allData = allData.concat(pageData)
      console.log(`Fetched page ${page}: ${pageData.length} items (total: ${allData.length})`)
      page++
      
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error)
      break
    }
  }

  return allData
}

async function findListByName(listName: string): Promise<any> {
  try {
    console.log('AFFINITY_API_KEY available:', !!AFFINITY_API_KEY)
    console.log('AFFINITY_API_KEY length:', AFFINITY_API_KEY?.length || 0)
    const lists = await fetchAffinityData<any>('/lists')
    console.log('Available lists:', lists.map((l: any) => l.name))
    
    // Try exact match first
    let foundList = lists.find((list: any) => 
      list.name.toLowerCase() === listName.toLowerCase()
    )
    
    // If not found, try partial match
    if (!foundList) {
      foundList = lists.find((list: any) => 
        list.name.toLowerCase().includes(listName.toLowerCase()) ||
        listName.toLowerCase().includes(list.name.toLowerCase())
      )
    }
    
    // If still not found, try common variations
    if (!foundList) {
      const variations = [
        'Motive Ventures Pipeline',
        'Motive Ventures',
        'Pipeline',
        'Ventures Pipeline',
        'MV Pipeline'
      ]
      
      for (const variation of variations) {
        foundList = lists.find((list: any) => 
          list.name.toLowerCase().includes(variation.toLowerCase())
        )
        if (foundList) break
      }
    }
    
    return foundList
  } catch (error) {
    console.error('Error fetching lists:', error)
    return null
  }
}

async function getOrganizationsInList(listId: number, limit: number = 50): Promise<any[]> {
  try {
    console.log(`Getting organizations from list ${listId} (has 6618 orgs according to list info, limiting to ${limit})`)
    
    // Use the Affinity API's list filtering capability
    // The organizations endpoint supports filtering by list_id
    const maxPages = Math.ceil(limit / 50) // 50 items per page
    const orgsInList = await fetchAllPages<any>('/organizations', { 
      list_id: listId.toString(),
      page_size: '50'
    }, maxPages)
    
    // Limit to the requested number
    const limitedOrgs = orgsInList.slice(0, limit)
    console.log(`Found ${limitedOrgs.length} organizations in list ${listId} (limited from ${orgsInList.length})`)
    return limitedOrgs
  } catch (error) {
    console.error('Error fetching organizations in list:', error)
    return []
  }
}

async function getOrganizationDetails(orgId: number): Promise<any> {
  try {
    const response = await fetch(`${AFFINITY_BASE_URL}/organizations/${orgId}`, {
      headers: basicAuthHeader()
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch organization ${orgId}: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error(`Error fetching organization ${orgId}:`, error)
    return null
  }
}

async function getPersonsForOrganization(orgId: number): Promise<any[]> {
  try {
    return await fetchAffinityData<any>('/persons', { organization_id: orgId.toString() })
  } catch (error) {
    console.error(`Error fetching persons for organization ${orgId}:`, error)
    return []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { list_name = 'Motive Ventures Pipeline', limit = 10 } = await req.json()

    console.log(`🔍 Looking for list: "${list_name}"`)

    // Step 1: Find the list
    const list = await findListByName(list_name)
    if (!list) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `List "${list_name}" not found`,
          available_lists: await fetchAffinityData<any>('/lists')
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Found list: ${list.name} (ID: ${list.id})`)

    // Step 2: Get organizations in the list
    const listEntries = await getOrganizationsInList(list.id, limit)
    console.log(`📋 Found ${listEntries.length} entries in list`)

    const results = {
      list: {
        id: list.id,
        name: list.name,
        type: list.type,
        organization_count: list.organization_count
      },
      organizations: [],
      contacts: [],
      errors: []
    }

    // Step 3: Process organizations (with limit)
    const entriesToProcess = listEntries.slice(0, limit)
    console.log(`🔄 Processing ${entriesToProcess.length} organizations...`)

    for (const entry of entriesToProcess) {
      try {
        // Debug: Log the entry structure
        console.log(`Processing entry:`, JSON.stringify(entry, null, 2))
        
        // Get organization ID from the entry
        const orgId = entry.id || entry.entity_id || entry.organization_id
        if (!orgId) {
          results.errors.push(`No organization ID found in entry: ${JSON.stringify(entry)}`)
          continue
        }
        
        // Get organization details
        const orgDetails = await getOrganizationDetails(orgId)
        if (!orgDetails) {
          results.errors.push(`Failed to fetch organization ${orgId}`)
          continue
        }

        // Upsert organization to Supabase
        const { data: company, error: companyError } = await supabaseClient
          .from('companies')
          .upsert({
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
          }, {
            onConflict: 'affinity_org_id'
          })
          .select()
          .single()

        if (companyError) {
          results.errors.push(`Failed to upsert company ${orgDetails.name}: ${companyError.message}`)
          continue
        }

        results.organizations.push({
          id: company.id,
          name: company.name,
          domain: company.domain,
          affinity_org_id: company.affinity_org_id
        })

        // Get persons for this organization
        const persons = await getPersonsForOrganization(orgDetails.id)
        console.log(`👥 Found ${persons.length} persons for ${orgDetails.name}`)

        for (const person of persons) {
          try {
            // Upsert contact to Supabase
            const { data: contact, error: contactError } = await supabaseClient
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
              .single()

            if (contactError) {
              results.errors.push(`Failed to upsert contact ${person.first_name} ${person.last_name}: ${contactError.message}`)
              continue
            }

            results.contacts.push({
              id: contact.id,
              name: contact.name,
              email: contact.email,
              title: contact.title,
              company_id: contact.company_id,
              affinity_person_id: contact.affinity_person_id
            })

          } catch (personError) {
            results.errors.push(`Error processing person ${person.id}: ${personError.message}`)
          }
        }

      } catch (orgError) {
        results.errors.push(`Error processing organization ${entry.entity_id}: ${orgError.message}`)
      }
    }

    console.log(`✅ Sync completed: ${results.organizations.length} organizations, ${results.contacts.length} contacts`)

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: `Successfully synced ${list_name}`,
        results,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in sync pipeline list:', error)
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
