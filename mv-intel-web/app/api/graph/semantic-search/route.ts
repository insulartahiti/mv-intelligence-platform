import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// Detect if query is asking for connection/intro paths
function isConnectionQuery(query: string): boolean {
  const connectionPatterns = [
    /who can connect me to/i,
    /who knows/i,
    /introduction to/i,
    /connect me with/i,
    /introduce me to/i,
    /who has connection to/i,
    /path to/i
  ]
  
  return connectionPatterns.some(pattern => pattern.test(query))
}

// Extract target person from connection query
function extractTargetPerson(query: string): string | null {
  // Look for patterns like "who can connect me to [PERSON]"
  const patterns = [
    /who can connect me to (.+)/i,
    /introduction to (.+)/i,
    /connect me with (.+)/i,
    /introduce me to (.+)/i,
    /who has connection to (.+)/i,
    /path to (.+)/i
  ]
  
  for (const pattern of patterns) {
    const match = query.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return null
}

// Extract meaningful search terms from complex queries
function extractSearchTerms(query: string): string[] {
  // Remove common stop words and connector phrases
  const stopWords = new Set([
    'who', 'can', 'connect', 'me', 'to', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'companies', 'company', 'people', 'person', 'organizations', 'organization', 'startups', 'startup'
  ])
  
  // Split query into words and filter out stop words
  const words = query.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word))
    .filter(word => !/^[^a-zA-Z0-9]+$/.test(word)) // Remove pure punctuation
  
  // Also extract potential proper nouns (capitalized words)
  const properNouns = query.split(/\s+/)
    .filter(word => word.length > 1 && /^[A-Z]/.test(word))
    .map(word => word.toLowerCase())
  
  // Combine and deduplicate
  const allTerms = [...words, ...properNouns]
  const uniqueTerms = [...new Set(allTerms)]
  
  // Return terms that are at least 2 characters long
  return uniqueTerms.filter(term => term.length >= 2)
}

interface SearchFilters {
  entityTypes?: string[]
  pipelineStages?: string[]
  funds?: string[]
  industries?: string[]
  showInternalOnly?: boolean
  showLinkedInOnly?: boolean
  minStrengthScore?: number
}

interface SearchResult {
  id: string
  name: string
  type: string
  similarity: number
  metadata: {
    domain?: string
    industry?: string
    pipeline_stage?: string
    fund?: string
    taxonomy?: string
    internal_owner?: boolean
    linkedin_first_degree?: boolean
    affinity_strength?: number
  }
  intro_paths?: Array<{
    path: string[]
    strength: number
    description: string
  }>
}

// Generate embedding for search query using OpenAI
async function generateEmbedding(text: string): Promise<number[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not found')
  }

  console.log('Generating embedding for:', text)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Embedding generated successfully')
    return data.data[0].embedding
  } catch (error) {
    clearTimeout(timeoutId)
    console.error('Error generating embedding:', error)
    throw error
  }
}

// Enhanced intro paths using intelligent path finding
async function findIntroPaths(targetId: string, limit: number = 3): Promise<Array<{
  path: string[]
  strength: number
  description: string
}>> {
  try {
    // Find Harsh Govil in the database
    const { data: harshData } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name')
      .eq('name', 'Harsh Govil')
      .eq('type', 'person')
      .limit(1)

    if (!harshData || harshData.length === 0) {
      console.log('Harsh Govil not found in database')
      return []
    }

    const harshId = harshData[0].id
    console.log(`Using Harsh Govil as starting point: ${harshId}`)
    console.log(`Target ID: ${targetId}`)

    // Use enhanced path finding with multiple strategies
    const paths = await findEnhancedPaths(harshId, targetId, limit)
    
    // Convert to expected format
    const introPaths: Array<{
      path: string[]
      strength: number
      description: string
    }> = paths.map(path => ({
      path: path.path.map(id => id), // Keep as IDs for now
      strength: path.score,
      description: path.description
    }))

    return introPaths
  } catch (error) {
    console.error('Error finding intro paths:', error)
    return []
  }
}

// Enhanced path finding with multiple strategies
async function findEnhancedPaths(startId: string, targetId: string, limit: number = 3): Promise<Array<{
  path: string[]
  score: number
  description: string
  strategy: string
}>> {
  const relationshipWeights = {
    'founder': 0.95,
    'ceo': 0.90,
    'cto': 0.85,
    'cfo': 0.85,
    'director': 0.80,
    'manager': 0.75,
    'employee': 0.70,
    'colleague': 0.65,
    'portfolio': 0.90,
    'deal_team': 0.80,
    'owner': 0.85
  }

  const visited = new Set<string>()
  const queue: Array<{ id: string; path: string[]; score: number; depth: number }> = [
    { id: startId, path: [startId], score: 0, depth: 0 }
  ]
  visited.add(startId)

  const foundPaths: Array<{
    path: string[]
    score: number
    description: string
    strategy: string
  }> = []

  const maxDepth = 3 // Reduced for speed
  const maxPaths = limit // Reduced for speed
  const maxNodes = 50 // Limit total nodes to visit
  let nodesVisited = 0

  console.log(`Starting path finding from ${startId} to ${targetId}`)

  while (queue.length > 0 && foundPaths.length < maxPaths && nodesVisited < maxNodes) {
    // Sort by score (highest first)
    queue.sort((a, b) => b.score - a.score)
    const { id, path, score, depth } = queue.shift()!
    nodesVisited++

    if (depth > maxDepth) continue

    if (id === targetId) {
      console.log(`Found target! Path length: ${path.length}, Depth: ${depth}`)
      const score = 1.0 - (depth * 0.2) // Higher score for shorter paths
      foundPaths.push({
        path: path,
        score: score,
        description: generateEnhancedPathDescription(path),
        strategy: depth === 1 ? 'direct' : depth === 2 ? 'one_degree' : 'multi_degree'
      })
      continue
    }

    // Get connected edges with relationship weights
    const { data: edges } = await supabase
      .schema('graph')
      .from('edges')
      .select('source, target, kind, strength_score')
      .or(`source.eq.${id},target.eq.${id}`)
      .limit(5) // Reduced for speed

    if (edges) {
      for (const edge of edges) {
        const nextId = edge.source === id ? edge.target : edge.source
        
        if (!visited.has(nextId)) {
          visited.add(nextId)
          
          // Calculate edge weight
          const baseWeight = edge.strength_score || 0.5
          const typeWeight = relationshipWeights[edge.kind as keyof typeof relationshipWeights] || 0.5
          const edgeWeight = (baseWeight + typeWeight) / 2
          
          // Bonus for shorter paths
          const lengthBonus = Math.max(0, 1 - depth * 0.1)
          const totalScore = score + edgeWeight + lengthBonus
          
          queue.push({
            id: nextId,
            path: [...path, nextId],
            score: totalScore,
            depth: depth + 1
          })
        }
      }
    }
  }

  // Sort by score and return top results
  return foundPaths
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// Generate enhanced path description
function generateEnhancedPathDescription(path: string[]): string {
  if (path.length === 2) {
    return 'Direct connection'
  } else if (path.length === 3) {
    return 'One degree of separation'
  } else if (path.length === 4) {
    return 'Two degrees of separation'
  } else {
    return `${path.length - 2} degrees of separation`
  }
}

// Find shortest path between two entities using BFS
async function findShortestPath(startId: string, targetId: string): Promise<string[] | null> {
  const visited = new Set<string>()
  const queue: Array<{ id: string; path: string[] }> = [{ id: startId, path: [startId] }]
  const maxDepth = 5 // Limit search depth to prevent infinite loops
  const maxNodes = 100 // Limit number of nodes to visit
  
  visited.add(startId)
  let nodesVisited = 0

  while (queue.length > 0 && nodesVisited < maxNodes) {
    const { id, path } = queue.shift()!
    nodesVisited++

    // Limit path depth
    if (path.length > maxDepth) {
      continue
    }

    if (id === targetId) {
      console.log(`Found path from ${startId} to ${targetId} in ${path.length} steps`)
      return path
    }

    try {
      // Get all connected entities
      const { data: edges } = await supabase
        .schema('graph')
        .from('edges')
        .select('source, target, strength_score')
        .or(`source.eq.${id},target.eq.${id}`)
        .limit(20) // Limit edges per node

      if (edges) {
        for (const edge of edges) {
          const nextId = edge.source === id ? edge.target : edge.source
          
          if (!visited.has(nextId) && visited.size < maxNodes) {
            visited.add(nextId)
            queue.push({ id: nextId, path: [...path, nextId] })
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching edges for ${id}:`, error)
      continue
    }
  }

  console.log(`No path found from ${startId} to ${targetId} (visited ${nodesVisited} nodes)`)
  return null
}

// Calculate path strength based on edge weights
function calculatePathStrength(path: string[]): number {
  // Simple implementation - in practice, you'd query edge strengths
  return Math.max(0.1, 1.0 - (path.length - 1) * 0.2)
}

// Generate human-readable path description
function generatePathDescription(path: string[]): string {
  if (path.length === 2) {
    return `Direct connection through ${path[1]}`
  } else if (path.length === 3) {
    return `Connected through ${path[1]}`
  } else {
    return `Multi-hop connection through ${path.length - 2} intermediaries`
  }
}

// Enhanced taxonomy-based scoring using IFT codes
function calculateTaxonomyScore(query: string, taxonomy: string[] | string | null): number {
  if (!taxonomy) return 0;
  
  const taxonomyArray = Array.isArray(taxonomy) ? taxonomy : [taxonomy];
  const queryLower = query.toLowerCase();
  let score = 0;
  
  // Map query terms to IFT taxonomy codes
  const queryToTaxonomy = {
    'kyb': ['IFT.RCI.ID.KYB.BASIC_PROFILE', 'IFT.RCI.ID.KYB.UBO_DISCOVERY', 'IFT.RCI.ID.KYB.DOC_COLLECTION'],
    'kyc': ['IFT.RCI.ID.KYC'],
    'aml': ['IFT.RCI.REG.TMON.REALTIME', 'IFT.RCI.REG.TMON.CASE_MGMT'],
    'compliance': ['IFT.RCI.REG.DYNAMIC_COMPLIANCE', 'IFT.RCI.REG.REPORTING', 'IFT.RCI.REG.REPORTING_DASHBOARDS'],
    'regtech': ['IFT.RCI.REG.PROFILE_DD', 'IFT.RCI.REG.BLOCKCHAIN_FORENSICS', 'IFT.RCI.REG.RISK_ANALYTICS'],
    'payment': ['IFT.PAY.COM.GATEWAY', 'IFT.PAY.COM.AGGREGATOR', 'IFT.PAY.INF.CLEARING'],
    'banking': ['IFT.DBK.RETAIL.NEO_BANK', 'IFT.DBK.MSME.NEO_BANK', 'IFT.DBK.BAAS'],
    'lending': ['IFT.LEN.BSL.BUSINESS', 'IFT.LEN.BSL.CONSUMER', 'IFT.LEN.P2P.BUSINESS'],
    'wealth': ['IFT.WLT.FO.CRM', 'IFT.WLT.FO.INVEST', 'IFT.WLT.BO.PMS'],
    'crypto': ['IFT.CRYP.EXCH.TRADE.ORDERBOOK', 'IFT.CRYP.CUST.INST.THIRD_PARTY', 'IFT.CRYP.STBL.ISSUER.FIAT_BACKED'],
    'insurance': ['IFT.INS.USAGE_BASED', 'IFT.INS.PARAMETRIC', 'IFT.INS.ON_DEMAND']
  };
  
  // Check for exact taxonomy matches
  for (const [queryTerm, taxonomyCodes] of Object.entries(queryToTaxonomy)) {
    if (queryLower.includes(queryTerm)) {
      for (const code of taxonomyCodes) {
        if (taxonomyArray.some(t => t.includes(code))) {
          score += 0.3; // Strong boost for exact taxonomy match
        }
      }
    }
  }
  
  // Check for partial taxonomy matches
  for (const taxCode of taxonomyArray) {
    if (taxCode.includes('IFT.RCI.ID.KYB') && queryLower.includes('kyb')) {
      score += 0.2;
    }
    if (taxCode.includes('IFT.RCI.ID.KYC') && queryLower.includes('kyc')) {
      score += 0.2;
    }
    if (taxCode.includes('IFT.RCI.REG') && queryLower.includes('compliance')) {
      score += 0.2;
    }
    if (taxCode.includes('IFT.PAY') && queryLower.includes('payment')) {
      score += 0.2;
    }
    if (taxCode.includes('IFT.DBK') && queryLower.includes('bank')) {
      score += 0.2;
    }
  }
  
  return Math.min(score, 0.5); // Cap at 0.5
}

// Check if entity has compliance-related taxonomy
function hasComplianceTaxonomy(taxonomy: string[] | string | null): boolean {
  if (!taxonomy) return false;
  
  const taxonomyArray = Array.isArray(taxonomy) ? taxonomy : [taxonomy];
  const complianceCodes = [
    'IFT.RCI.ID.KYB',
    'IFT.RCI.ID.KYC', 
    'IFT.RCI.REG.TMON',
    'IFT.RCI.REG.DYNAMIC_COMPLIANCE',
    'IFT.RCI.REG.REPORTING',
    'IFT.RCI.REG.BLOCKCHAIN_FORENSICS',
    'IFT.RCI.REG.RISK_ANALYTICS'
  ];
  
  return taxonomyArray.some(tax => 
    complianceCodes.some(code => tax.includes(code))
  );
}

// Check if entity is clearly non-compliance related
function isNonComplianceEntity(aiSummary: string): boolean {
  const nonComplianceTerms = [
    'consulting', 'marketing', 'g2m', 'go-to-market', 
    'advertising', 'branding', 'design', 'creative',
    'supply chain', 'logistics', 'manufacturing'
  ];
  
  const summaryLower = aiSummary.toLowerCase();
  return nonComplianceTerms.some(term => summaryLower.includes(term));
}

// Check if entity has generic non-compliance name
function isGenericNonComplianceName(name: string): boolean {
  const genericTerms = [
    'company', 'brands', 'supply chain', 'consulting', 
    'marketing', 'advertising', 'group', 'holdings',
    'ventures', 'capital', 'partners'
  ];
  
  const nameLower = name.toLowerCase();
  return genericTerms.some(term => nameLower.includes(term));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('🚀 Starting semantic search request')
    const body = await request.json()
    const { query, filters = {}, limit = 50 } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Query is required' },
        { status: 400 }
      )
    }

    // Set a timeout for the entire operation
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Search timeout after 15 seconds')), 15000)
    })

    const searchPromise = performSearch(query, filters, limit)
    
    const result = await Promise.race([searchPromise, timeoutPromise]) as NextResponse
    return result
  } catch (error) {
    console.error('Semantic search error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Search failed'
      },
      { status: 500 }
    )
  }
}

async function performSearch(query: string, filters: any, limit: number) {
  try {
    console.log('Semantic search query:', query)
    console.log('Filters:', filters)

    // Check if this is a connection query
    if (isConnectionQuery(query)) {
      console.log('🔗 Detected connection query - using intro path logic')
      const targetPerson = extractTargetPerson(query)
      console.log('Target person:', targetPerson)
      
      if (targetPerson) {
        // Find entities matching the target person
        const { data: targetEntities } = await supabase
          .schema('graph')
          .from('entities')
          .select('id, name, type')
          .or(`name.ilike.%${targetPerson}%`)
          .limit(5)
        
        if (targetEntities && targetEntities.length > 0) {
          // For each target entity, find intro paths
          const connectionResults = []
          
          for (const targetEntity of targetEntities) {
            const introPaths = await findIntroPaths(targetEntity.id, 5)
            
            if (introPaths.length > 0) {
              // Get details of the connecting people (people in the path between Harsh and target)
              for (const path of introPaths) {
                // Get all people in the path (excluding Harsh and target)
                const connectorIds = path.path.slice(1, -1) // Remove first (Harsh) and last (target)
                
                for (const connectorId of connectorIds) {
                  const { data: connector } = await supabase
                    .schema('graph')
                    .from('entities')
                    .select('id, name, type, enrichment_data')
                    .eq('id', connectorId)
                    .single()
                  
                  if (connector) {
                    connectionResults.push({
                      id: connector.id,
                      name: connector.name,
                      type: connector.type,
                      similarity: path.strength,
                      metadata: {
                        connection_type: 'intro_path',
                        target_person: targetEntity.name,
                        path_description: path.description,
                        path_strength: path.strength,
                        full_path: path.path
                      },
                      intro_paths: [path]
                    })
                  }
                }
              }
            }
          }
          
          // Remove duplicates and sort by strength
          const uniqueConnectors = connectionResults.reduce((acc: any[], current: any) => {
            const existing = acc.find(item => item.id === current.id)
            if (!existing || current.similarity > existing.similarity) {
              return acc.filter(item => item.id !== current.id).concat([current])
            }
            return acc
          }, [])
          
          uniqueConnectors.sort((a, b) => b.similarity - a.similarity)
          
          return NextResponse.json({
            success: true,
            results: uniqueConnectors.slice(0, limit),
            query,
            filters,
            total: uniqueConnectors.length,
            search_type: 'connection'
          })
        } else {
          // No target entities found, return empty result
          return NextResponse.json({
            success: true,
            results: [],
            query,
            filters,
            total: 0,
            search_type: 'connection',
            message: 'No matching entities found for the target person'
          })
        }
      } else {
        // No target person extracted, fall through to regular search
        console.log('No target person extracted, using regular search')
      }
    }

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query)

    // Extract meaningful search terms from the query
    const searchTerms = extractSearchTerms(query)
    console.log('Extracted search terms:', searchTerms)

    // Enhanced hybrid approach: text search + vector similarity + enrichment data
    // First, get entities that match text search, including enrichment data
    let textQuery = supabase
      .schema('graph')
      .from('entities')
      .select(`
        id,
        name,
        type,
        domain,
        industry,
        pipeline_stage,
        fund,
        taxonomy,
        is_internal,
        is_portfolio,
        is_pipeline,
        importance,
        enrichment_data,
        ai_summary,
        ai_insights,
        ai_tags
      `)

    // Build dynamic search conditions based on extracted terms, including enrichment data
    if (searchTerms.length > 0) {
      const searchConditions = searchTerms.map(term => 
        `name.ilike.%${term}%,industry.ilike.%${term}%,domain.ilike.%${term}%,ai_summary.ilike.%${term}%`
      ).join(',')
      textQuery = textQuery.or(searchConditions)
    } else {
      // Fallback to original query if no terms extracted, including enrichment data
      textQuery = textQuery.or(`name.ilike.%${query}%,industry.ilike.%${query}%,domain.ilike.%${query}%,ai_summary.ilike.%${query}%`)
    }

    // Apply filters
    if (filters.entityTypes && filters.entityTypes.length > 0) {
      textQuery = textQuery.in('type', filters.entityTypes)
    }

    if (filters.pipelineStages && filters.pipelineStages.length > 0) {
      textQuery = textQuery.in('pipeline_stage', filters.pipelineStages)
    }

    if (filters.funds && filters.funds.length > 0) {
      textQuery = textQuery.in('fund', filters.funds)
    }

    if (filters.industries && filters.industries.length > 0) {
      textQuery = textQuery.in('industry', filters.industries)
    }

    if (filters.showInternalOnly) {
      textQuery = textQuery.eq('is_internal', true)
    }

    if (filters.showLinkedInOnly) {
      textQuery = textQuery.eq('is_pipeline', true)
    }

    // Execute text search first
    const { data: textResults, error: textError } = await textQuery
      .order('importance', { ascending: false })
      .limit(limit * 2) // Get more results for vector filtering

    if (textError) {
      console.error('Text search error:', textError)
      return NextResponse.json(
        { success: false, message: 'Text search failed' },
        { status: 500 }
      )
    }

    // If we have embeddings, try vector similarity search
    let entities = textResults || []
    
    console.log('🔍 Debug: queryEmbedding exists:', !!queryEmbedding, 'length:', queryEmbedding?.length)
    console.log('🔍 Debug: textResults count:', textResults?.length || 0)
    
    try {
      // Try to use the match_entities function if it exists
      const { data: vectorResults, error: vectorError } = await supabase
        .rpc('match_entities', {
          query_embedding: queryEmbedding,
          match_threshold: 0.3, // More reasonable threshold
          match_count: limit
        })

      if (!vectorError && vectorResults && vectorResults.length > 0) {
        // Use vector results if available
        console.log('✅ Using vector search results:', vectorResults.length, 'entities found')
        entities = vectorResults
      } else {
        console.log('❌ Vector search not available, using text results. Error:', vectorError?.message)
        // Fall back to text results
        entities = textResults || []
      }
    } catch (error) {
      console.log('Vector search failed, using text results:', error)
      // Fall back to text results
      entities = textResults || []
    }

    // Error handling is now done above for each query type

    if (!entities || entities.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        message: 'No entities found matching your query'
      })
    }

    // Format results with enrichment data (skip intro paths for regular searches to avoid timeout)
    const results: SearchResult[] = entities.map((entity) => {
      // Calculate enhanced similarity score based on enrichment data
      let enhancedSimilarity = (entity as any).similarity || 0;
      
      // Enhanced taxonomy-based scoring using IFT codes
      const taxonomyScore = calculateTaxonomyScore(query, entity.taxonomy);
      enhancedSimilarity += taxonomyScore;
      
      // Domain-specific scoring for compliance queries
      if (query.toLowerCase().includes('kyb') || query.toLowerCase().includes('compliance')) {
        // Boost for entities with proper IFT taxonomy classification
        if (entity.taxonomy && hasComplianceTaxonomy(entity.taxonomy)) {
          enhancedSimilarity += 0.4; // Strong boost for compliance taxonomy
        }
        
        // Penalize entities that are clearly not compliance-related
        if (entity.ai_summary && isNonComplianceEntity(entity.ai_summary)) {
          enhancedSimilarity -= 0.3; // Penalty for non-compliance entities
        }
        
        // Heavy penalty for entities with no context data (likely poor matches)
        if (!entity.ai_summary && !entity.taxonomy && !entity.enrichment_data) {
          enhancedSimilarity *= 0.2; // Reduce similarity by 80% for entities with no context
        }
        
        // Additional penalty for entities with generic names that don't suggest compliance
        if (isGenericNonComplianceName(entity.name)) {
          enhancedSimilarity *= 0.3; // Reduce similarity by 70% for generic non-compliance names
        }
      }
      
      // Boost score if entity has enrichment data
      if (entity.enrichment_data && entity.enrichment_data.parsed_web_data) {
        enhancedSimilarity += 0.15; // Boost for having parsed enrichment data
      }
      
      // Boost score if entity has AI-generated content
      if (entity.ai_summary || entity.ai_insights) {
        enhancedSimilarity += 0.1; // Boost for AI content
      }
      
      // Boost for entities with comprehensive taxonomy classification
      if (entity.taxonomy && Array.isArray(entity.taxonomy) && entity.taxonomy.length > 1) {
        enhancedSimilarity += 0.05; // Boost for multiple taxonomy classifications
      }
      
      return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        similarity: Math.min(enhancedSimilarity, 1.0), // Cap at 1.0
        metadata: {
          domain: entity.domain,
          industry: entity.industry,
          pipeline_stage: entity.pipeline_stage,
          fund: entity.fund,
          taxonomy: entity.taxonomy,
          internal_owner: entity.is_internal,
          is_portfolio: entity.is_portfolio,
          is_pipeline: entity.is_pipeline,
          importance: entity.importance,
          // Include enrichment data in metadata
          ai_summary: entity.ai_summary,
          ai_insights: entity.ai_insights,
          ai_tags: entity.ai_tags,
          has_enrichment_data: !!entity.enrichment_data,
          enrichment_insights: entity.enrichment_data?.parsed_web_data?.keyInsights || [],
          recent_news: entity.enrichment_data?.parsed_web_data?.recentNews?.length || 0,
          company_info: entity.enrichment_data?.parsed_web_data?.companyInfo || {}
        }
      }
    })

    // Sort by similarity score
    results.sort((a, b) => b.similarity - a.similarity)

    return NextResponse.json({
      success: true,
      results,
      query,
      filters,
      total: results.length
    })

  } catch (error) {
    console.error('Semantic search error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Search failed' 
      },
      { status: 500 }
    )
  }
}

// Handle GET requests for testing
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  const query = url.searchParams.get('q') || 'fintech companies'
  const limit = parseInt(url.searchParams.get('limit') || '10')

  try {
    const response = await POST(new NextRequest(request.url, {
      method: 'POST',
      body: JSON.stringify({ query, limit })
    }))

    return response
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Search failed' },
      { status: 500 }
    )
  }
}