import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return NextResponse.json({ success: false, message: 'Missing configuration' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

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

    const searchPromise = performSearch(query, filters, limit, supabase)
    
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

async function performSearch(query: string, filters: any, limit: number, supabase: any) {
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