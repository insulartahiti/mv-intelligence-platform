import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { createHash } from 'crypto'
import { config } from 'dotenv'

// Load environment variables
config({ path: '../../.env' })

console.log('Environment variables loaded:')
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Present' : 'Missing')

// Initialize Supabase client - using service role key for bulk imports
const supabaseUrl = 'https://uqptiychukuwixubrbat.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcHRpeWNodWt1d2l4dWJyYmF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDY2NjI5OCwiZXhwIjoyMDcwMjQyMjk4fQ.o3yC3GpX80hK2cozCyQDv12zORe9ZQ-Ar8wAcJc1iLg'
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Types for CSV data
interface AffinityCSVRow {
  'Affinity Row ID': string
  'Organization Id': string
  'Name': string
  'Website': string
  'People': string
  'Status': string
  'Owners': string
  'Deal team': string
  'Total Investment Amount': string
  'Pre-Money Valuation': string
  'Location (City)': string
  'Location (Country)': string
  'Urgency': string
  'Series': string
  'Founder Gender': string
  'Pass/lost reason': string
  'Sourced by (Full Name)': string
  'Sourced by (Email)': string
  'Notion Page': string
  'Related Deals': string
  'Apollo taxonomy': string
  'Number of Employees': string
  'Industries': string
  'LinkedIn Profile (Founders/CEOs)': string
  'Description': string
  'Fund': string
  'Current Round Investment Amount': string
  'Year Founded': string
  'Taxonomy': string
  'Taxonomy Subcategory': string
  'Brief Description': string
}

// Generate deterministic UUID for deduplication
function generateEntityId(name: string, type: string, domain?: string): string {
  const input = `${name}-${type}-${domain || ''}`
  const hash = createHash('sha256').update(input).digest('hex')
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`
}

// Parse people from comma-separated strings
function parsePeople(peopleString: string): Array<{name: string, email?: string, linkedin?: string}> {
  if (!peopleString || peopleString.trim() === '') return []
  
  return peopleString.split(',').map(person => {
    const trimmed = person.trim()
    const emailMatch = trimmed.match(/<([^>]+)>/)
    const linkedinMatch = trimmed.match(/https:\/\/linkedin\.com\/in\/[^\s)]+/)
    
    return {
      name: trimmed.replace(/<[^>]+>/, '').replace(/https:\/\/linkedin\.com\/in\/[^\s)]+/, '').trim(),
      email: emailMatch ? emailMatch[1] : undefined,
      linkedin: linkedinMatch ? linkedinMatch[0] : undefined
    }
  })
}

// Parse owners and deal team
function parseOwnersAndTeam(ownersString: string, dealTeamString: string): Array<{name: string, email?: string, role: 'owner' | 'deal_team'}> {
  const people: Array<{name: string, email?: string, role: 'owner' | 'deal_team'}> = []
  
  if (ownersString && ownersString.trim() !== '') {
    const owners = parsePeople(ownersString)
    people.push(...owners.map(p => ({ ...p, role: 'owner' as const })))
  }
  
  if (dealTeamString && dealTeamString.trim() !== '') {
    const team = parsePeople(dealTeamString)
    people.push(...team.map(p => ({ ...p, role: 'deal_team' as const })))
  }
  
  return people
}

// Convert CSV row to entity
function csvRowToEntity(row: AffinityCSVRow) {
  const domain = row.Website ? new URL(row.Website.startsWith('http') ? row.Website : `https://${row.Website}`).hostname : ''
  
  return {
    id: generateEntityId(row.Name, 'organization', domain),
    name: row.Name,
    type: 'organization',
    
    // Basic entity info
    domain: domain,
    website: row.Website || '',
    description: row.Description || row['Brief Description'] || '',
    
    // Affinity CRM integration
    affinity_org_id: parseInt(row['Organization Id']),
    
    // Pipeline and deal information
    pipeline_stage: row.Status || '',
    fund: row.Fund || '',
    taxonomy: row.Taxonomy || '',
    taxonomy_subcategory: row['Taxonomy Subcategory'] || '',
    valuation_amount: parseFloat(row['Pre-Money Valuation']) || null,
    investment_amount: parseFloat(row['Total Investment Amount']) || parseFloat(row['Current Round Investment Amount']) || null,
    year_founded: parseInt(row['Year Founded']) || null,
    employee_count: parseInt(row['Number of Employees']) || null,
    
    // Location
    location_city: row['Location (City)'] || '',
    location_country: row['Location (Country)'] || '',
    
    // Deal-specific fields
    urgency: row.Urgency || '',
    series: row.Series || '',
    founder_gender: row['Founder Gender'] || '',
    pass_lost_reason: row['Pass/lost reason'] || '',
    sourced_by: row['Sourced by (Full Name)'] || '',
    notion_page: row['Notion Page'] || '',
    related_deals: row['Related Deals'] ? [row['Related Deals']] : [],
    apollo_taxonomy: row['Apollo taxonomy'] || '',
    brief_description: row['Brief Description'] || '',
    
    // Industry and taxonomy
    industry: row.Industries || '',
    
    // Metadata and tracking
    source: 'affinity_csv_import',
    enriched: false,
    last_synced_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    
    // Importance and scoring
    importance: 0.5,
    relevance_score: 0.5,
    confidence_score: 0.5,
    
    // Status and flags
    is_active: true,
    is_internal: false,
    is_portfolio: row.Fund ? true : false,
    is_pipeline: row.Status ? true : false
  }
}

// Main import function
async function importAffinityCSV() {
  try {
    console.log('Starting Affinity CSV import...')
    
    // Read and parse CSV file
    const csvContent = readFileSync('Motive_Ventures_Pipeline_All_deals__export_10-Oct-2025.csv', 'utf-8')
    const records: AffinityCSVRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })

    console.log(`Found ${records.length} records in CSV`)
    
    const entities = []
    const edges = []
    const people = new Map<string, any>() // Track people for deduplication
    
    // Process each CSV row
    for (const row of records) {
      if (!row.Name || row.Name.trim() === '') continue
      
      // Convert to entity
      const entity = csvRowToEntity(row)
      entities.push(entity)
      
      // Parse people (owners and deal team)
      const peopleData = parseOwnersAndTeam(row.Owners, row['Deal team'])
      
      for (const personData of peopleData) {
        if (!personData.name || personData.name.trim() === '') continue
        
        // Generate person entity ID
        const personId = generateEntityId(personData.name, 'person', personData.email)
        
        // Create person entity if not exists
        if (!people.has(personId)) {
          const personEntity = {
          id: personId,
            name: personData.name,
          type: 'person',
            email: personData.email || '',
            linkedin_url: (personData as any).linkedin || '',
          source: 'affinity_csv_import',
            enriched: false,
            last_synced_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            importance: 0.5,
            relevance_score: 0.5,
            confidence_score: 0.5,
            is_active: true,
            is_internal: false,
            is_portfolio: false,
            is_pipeline: false
          }
          people.set(personId, personEntity)
        }
        
        // Create edge between person and organization
        const edge = {
          id: generateEntityId(`${personData.name}-${row.Name}`, 'edge', personData.role),
          source: personId,
          target: entity.id,
          kind: personData.role === 'owner' ? 'owner' : 'deal_team',
          strength_score: personData.role === 'owner' ? 0.9 : 0.8,
          source_type: 'affinity_csv_import',
          interaction_count: 0,
          interaction_types: [],
          confidence_score: 0.8
        }
        edges.push(edge)
      }
    }
    
    console.log(`Processed ${entities.length} organizations and ${people.size} people`)
    console.log(`Created ${edges.length} relationships`)

    // Insert entities in batches
    const batchSize = 100
    let insertedEntities = 0
    let insertedPeople = 0
    let insertedEdges = 0
      
    // Insert organizations
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize)
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .upsert(batch, { onConflict: 'id' })

      if (error) {
        console.error(`Error inserting organization batch ${i}-${i + batchSize}:`, error)
      } else {
        insertedEntities += batch.length
        console.log(`Inserted ${insertedEntities}/${entities.length} organizations`)
      }
    }
    
    // Insert people
    const peopleArray = Array.from(people.values())
    for (let i = 0; i < peopleArray.length; i += batchSize) {
      const batch = peopleArray.slice(i, i + batchSize)
      const { error } = await supabase
        .schema('graph')
        .from('entities')
        .upsert(batch, { onConflict: 'id' })
      
      if (error) {
        console.error(`Error inserting people batch ${i}-${i + batchSize}:`, error)
      } else {
        insertedPeople += batch.length
        console.log(`Inserted ${insertedPeople}/${peopleArray.length} people`)
      }
    }
    
    // Insert edges
    for (let i = 0; i < edges.length; i += batchSize) {
      const batch = edges.slice(i, i + batchSize)
      const { error } = await supabase
        .schema('graph')
        .from('edges')
        .upsert(batch, { onConflict: 'id' })

      if (error) {
        console.error(`Error inserting edges batch ${i}-${i + batchSize}:`, error)
      } else {
        insertedEdges += batch.length
        console.log(`Inserted ${insertedEdges}/${edges.length} edges`)
      }
    }
    
    console.log('✅ CSV import completed successfully!')
    console.log(`📊 Summary:`)
    console.log(`   - Organizations: ${insertedEntities}`)
    console.log(`   - People: ${insertedPeople}`)
    console.log(`   - Relationships: ${insertedEdges}`)

  } catch (error) {
    console.error('❌ Error during CSV import:', error)
    process.exit(1)
  }
}

// Run the import
if (require.main === module) {
  importAffinityCSV()
}

export { importAffinityCSV }