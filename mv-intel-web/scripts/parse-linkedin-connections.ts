#!/usr/bin/env tsx

/**
 * LinkedIn Connections Parser
 * Parses LinkedIn data export and integrates with knowledge graph
 * Implements fuzzy matching for deduplication
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { createHash } from 'crypto'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface LinkedInConnection {
  'First Name': string
  'Last Name': string
  'URL': string
  'Email Address': string
  'Company': string
  'Position': string
  'Connected On': string
}

interface PersonMatch {
  entity: any
  confidence: number
  matchType: 'exact' | 'fuzzy' | 'domain' | 'none'
}

interface ParsedConnection {
  firstName: string
  lastName: string
  fullName: string
  company: string
  position: string
  email: string
  profileUrl: string
  connectedOn: string
}

function cleanName(name: string): string {
  if (!name || typeof name !== 'string') return ''
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\w\s.-]/g, '') // Keep periods for initials
}

function cleanCompany(company: string): string {
  if (!company || typeof company !== 'string') return ''
  return company
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars except hyphens
}

function extractDomain(url: string): string | null {
  if (!url) return null
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return null
  }
}

function calculateLevenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      )
    }
  }
  
  return matrix[str2.length][str1.length]
}

function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  const distance = calculateLevenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  const maxLength = Math.max(str1.length, str2.length)
  return maxLength === 0 ? 1 : (maxLength - distance) / maxLength
}

async function findPersonMatch(connection: ParsedConnection): Promise<PersonMatch> {
  const { fullName, company, email, profileUrl } = connection
  
  // Try exact name match first
  const { data: exactMatches } = await supabase
    .schema('graph')
    .from('entities')
    .select('*')
    .eq('type', 'person')
    .ilike('name', fullName)
    .limit(10)

  if (exactMatches && exactMatches.length > 0) {
    return {
      entity: exactMatches[0],
      confidence: 1.0,
      matchType: 'exact'
    }
  }

  // Try fuzzy name matching
  const { data: allPeople } = await supabase
    .schema('graph')
    .from('entities')
    .select('*')
    .eq('type', 'person')
    .limit(1000) // Get a reasonable sample for fuzzy matching

  if (allPeople) {
    let bestMatch: any = null
    let bestScore = 0
    let matchType: 'fuzzy' | 'domain' | 'none' = 'none'

    for (const person of allPeople) {
      const nameSimilarity = calculateSimilarity(fullName, person.name)
      
      // Check if we have company information to match
      if (company && person.metadata?.company) {
        const companySimilarity = calculateSimilarity(company, person.metadata.company)
        const combinedScore = (nameSimilarity * 0.7) + (companySimilarity * 0.3)
        
        if (combinedScore > bestScore && combinedScore > 0.6) {
          bestMatch = person
          bestScore = combinedScore
          matchType = 'fuzzy'
        }
      } else if (nameSimilarity > bestScore && nameSimilarity > 0.8) {
        bestMatch = person
        bestScore = nameSimilarity
        matchType = 'fuzzy'
      }
    }

    if (bestMatch) {
      return {
        entity: bestMatch,
        confidence: bestScore,
        matchType
      }
    }
  }

  // Try domain matching if we have a website
  if (profileUrl) {
    const domain = extractDomain(profileUrl)
    if (domain) {
      const { data: domainMatches } = await supabase
        .schema('graph')
        .from('entities')
        .select('*')
        .eq('type', 'person')
        .ilike('domain', `%${domain}%`)
        .limit(5)

      if (domainMatches && domainMatches.length > 0) {
        return {
          entity: domainMatches[0],
          confidence: 0.7,
          matchType: 'domain'
        }
      }
    }
  }

  return {
    entity: null,
    confidence: 0,
    matchType: 'none'
  }
}

function generateDeterministicId(prefix: string, name: string, company?: string): string {
  const input = `${prefix}:${name.toLowerCase().trim()}:${company?.toLowerCase().trim() || ''}`
  const hash = createHash('md5').update(input).digest('hex')
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`
}

async function createPersonEntity(connection: ParsedConnection): Promise<string> {
  const personId = generateDeterministicId('person', connection.fullName, connection.company)
  
  const personEntity = {
    id: personId,
    name: connection.fullName,
    type: 'person',
    domain: connection.profileUrl ? extractDomain(connection.profileUrl) : null,
    linkedin_url: connection.profileUrl,
    linkedin_first_degree: true,
    source: 'linkedin_import',
    metadata: {
      first_name: connection.firstName,
      last_name: connection.lastName,
      company: connection.company,
      position: connection.position,
      email: connection.email,
      connected_on: connection.connectedOn
    }
  }

  const { error } = await supabase
    .schema('graph')
    .from('entities')
    .upsert(personEntity)

  if (error) {
    console.error(`Error creating person entity:`, error.message)
    throw error
  }

  return personId
}

async function createLinkedInConnection(personEntityId: string, connection: ParsedConnection): Promise<void> {
  const linkedinConnection = {
    person_entity_id: personEntityId,
    linkedin_profile_url: connection.profileUrl,
    connection_date: connection.connectedOn ? new Date(connection.connectedOn).toISOString() : null,
    connection_strength: 1.0
  }

  const { error } = await supabase
    .schema('graph')
    .from('linkedin_connections')
    .upsert(linkedinConnection, { onConflict: 'person_entity_id,linkedin_profile_url' })

  if (error) {
    console.error(`Error creating LinkedIn connection:`, error.message)
    throw error
  }
}

async function updatePersonEntity(personEntityId: string, connection: ParsedConnection): Promise<void> {
  const updateData = {
    linkedin_first_degree: true,
    linkedin_url: connection.profileUrl,
    metadata: {
      linkedin_import: true,
      linkedin_connected_on: connection.connectedOn,
      linkedin_notes: (connection as any).notes || ''
    }
  }

  const { error } = await supabase
    .schema('graph')
    .from('entities')
    .update(updateData)
    .eq('id', personEntityId)

  if (error) {
    console.error(`Error updating person entity:`, error.message)
    throw error
  }
}

async function parseLinkedInConnections() {
  console.log('🔗 Starting LinkedIn connections import...\n')

  try {
    // Check if Connections.csv exists
    const csvPath = 'Connections.csv'
    if (!require('fs').existsSync(csvPath)) {
      console.error(`❌ LinkedIn export file not found: ${csvPath}`)
      console.log('Please export your LinkedIn connections and save as Connections.csv')
      process.exit(1)
    }

    // Read and parse CSV
    console.log('📄 Reading LinkedIn connections CSV...')
    const csvContent = readFileSync(csvPath, 'utf-8')
    
    // Find the actual header row (skip the notes section)
    const lines = csvContent.split('\n')
    let headerIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('First Name,Last Name,URL')) {
        headerIndex = i
        break
      }
    }
    
    if (headerIndex === -1) {
      throw new Error('Could not find CSV header row')
    }
    
    const csvData = lines.slice(headerIndex).join('\n')
    const records: LinkedInConnection[] = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })

    console.log(`📊 Found ${records.length} LinkedIn connections to process`)

    let processed = 0
    let matched = 0
    let created = 0
    let updated = 0
    let errors = 0

    const matchStats = {
      exact: 0,
      fuzzy: 0,
      domain: 0,
      none: 0
    }

    for (const [index, record] of records.entries()) {
      if (index % 50 === 0) {
        console.log(`🔄 Processing connection ${index + 1}/${records.length}`)
      }

      try {
        // Parse connection data
        const connection: ParsedConnection = {
          firstName: cleanName(record['First Name'] || ''),
          lastName: cleanName(record['Last Name'] || ''),
          fullName: cleanName(`${record['First Name'] || ''} ${record['Last Name'] || ''}`),
          company: cleanCompany(record['Company'] || ''),
          position: record['Position'] || '',
          email: record['Email Address'] || '',
          profileUrl: record['URL'] || '',
          connectedOn: record['Connected On'] || ''
        }

        if (!connection.fullName || connection.fullName.trim() === '') {
          console.log(`⚠️  Skipping connection with no name: ${JSON.stringify(record)}`)
          continue
        }

        // Find matching person in knowledge graph
        const match = await findPersonMatch(connection)
        matchStats[match.matchType]++

        if (match.entity) {
          // Update existing person
          await updatePersonEntity(match.entity.id, connection)
          await createLinkedInConnection(match.entity.id, connection)
          updated++
          matched++
          console.log(`✅ Matched: ${connection.fullName} (${match.matchType}, confidence: ${match.confidence.toFixed(2)})`)
        } else {
          // Create new person
          const personId = await createPersonEntity(connection)
          await createLinkedInConnection(personId, connection)
          created++
          console.log(`🆕 Created: ${connection.fullName} at ${connection.company}`)
        }

        processed++

      } catch (error) {
        console.error(`❌ Error processing connection ${index + 1}:`, error)
        errors++
      }
    }

    console.log('\n🎉 LinkedIn import completed!')
    console.log(`📊 Final Results:`)
    console.log(`   • Total processed: ${processed}`)
    console.log(`   • Matched existing: ${matched} (${updated} updated)`)
    console.log(`   • Created new: ${created}`)
    console.log(`   • Errors: ${errors}`)
    console.log(`\n📈 Match Statistics:`)
    console.log(`   • Exact matches: ${matchStats.exact}`)
    console.log(`   • Fuzzy matches: ${matchStats.fuzzy}`)
    console.log(`   • Domain matches: ${matchStats.domain}`)
    console.log(`   • No matches: ${matchStats.none}`)

  } catch (error) {
    console.error('❌ LinkedIn import failed:', error)
    process.exit(1)
  }
}

// Run the import
parseLinkedInConnections()