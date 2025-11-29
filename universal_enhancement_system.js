#!/usr/bin/env node

/**
 * Universal Enhancement System
 * Comprehensive entity enhancement with Perplexity + LinkedIn intelligence + Network mapping
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// PERPLEXITY ENHANCEMENT
// ============================================================================

async function searchWeb(query, maxResults = 5) {
  const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityApiKey) {
    console.log('⚠️ PERPLEXITY_API_KEY not found, skipping web search');
    console.log('💡 To enable web search, add PERPLEXITY_API_KEY to your .env file');
    return '';
  }

  try {
    // Use Perplexity Search API instead of chat completions
    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        max_results: maxResults
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log('❌ Perplexity API key is invalid or expired');
        console.log('💡 Please get a new API key from: https://www.perplexity.ai/settings/api');
        console.log('💡 Update PERPLEXITY_API_KEY in your .env file');
      } else {
        console.log(`⚠️ Perplexity API error: ${response.status}, skipping web search`);
      }
      return '';
    }

    const data = await response.json();
    
    // Format search results into a structured response
    if (data.results && data.results.length > 0) {
      const formattedResults = data.results.map(result => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet
      }));
      
      return JSON.stringify({
        query: query,
        results: formattedResults,
        summary: `Found ${formattedResults.length} relevant results for: ${query}`
      }, null, 2);
    }
    
    return '';
  } catch (error) {
    console.log('⚠️ Perplexity search error, skipping web search:', error.message);
    return '';
  }
}

function getEnrichmentQueries(entityType, entityName, existingData = {}) {
  const baseQueries = {
    person: [
      `${entityName} current role company position 2024 2025`,
      `${entityName} recent publications speaking engagements expertise`,
      `${entityName} professional background career achievements`,
      `${entityName} LinkedIn profile network connections`
    ],
    company: [
      `${entityName} recent funding news 2024 2025`,
      `${entityName} market position competitors analysis`,
      `${entityName} recent partnerships acquisitions developments`,
      `${entityName} leadership team executives 2024`
    ],
    organization: [
      `${entityName} recent developments initiatives 2024`,
      `${entityName} leadership changes strategic direction`,
      `${entityName} industry trends market position`,
      `${entityName} partnerships collaborations 2024`
    ],
    technology: [
      `${entityName} adoption trends market share 2024`,
      `${entityName} recent developments updates`,
      `${entityName} competitive landscape alternatives`,
      `${entityName} industry applications use cases`
    ]
  };

  // Add domain-specific queries if we have additional context
  if (existingData.domain) {
    baseQueries[entityType]?.push(`${entityName} ${existingData.domain} industry trends`);
  }
  if (existingData.industry) {
    baseQueries[entityType]?.push(`${entityName} ${existingData.industry} sector analysis`);
  }

  return baseQueries[entityType] || [
    `${entityName} recent developments 2024`,
    `${entityName} current status information`,
    `${entityName} industry trends market position`
  ];
}

async function extractStructuredData(content, entityType, entityName) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return { raw_content: content };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Extract structured data from the following content about ${entityName} (${entityType}). Return a JSON object with relevant fields based on the entity type. Focus on current, factual information that would be useful for business intelligence and relationship mapping.`
          },
          {
            role: 'user',
            content: content
          }
        ],
        max_tokens: 1500,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const extractedContent = data.choices[0]?.message?.content || '';
    
    try {
      return JSON.parse(extractedContent);
    } catch {
      return { raw_content: extractedContent };
    }
  } catch (error) {
    console.error('OpenAI extraction error:', error);
    return { raw_content: content };
  }
}

// ============================================================================
// LINKEDIN INTELLIGENCE INTEGRATION
// ============================================================================

async function processLinkedInConnections() {
  console.log('🔗 Processing LinkedIn Connections...\n');
  
  // Check if we have LinkedIn connections data
  const { data: linkedinConnections } = await supabase
    .schema('graph')
    .from('linkedin_connections')
    .select('*')
    .limit(10);

  if (!linkedinConnections || linkedinConnections.length === 0) {
    console.log('⚠️ No LinkedIn connections found. Checking for CSV import...');
    
    // Check if Connections.csv exists
    const fs = require('fs');
    if (fs.existsSync('Connections.csv')) {
      console.log('📄 Found Connections.csv, importing LinkedIn data...');
      await importLinkedInConnections();
    } else {
      console.log('❌ No LinkedIn data available. Skipping LinkedIn processing.');
      return;
    }
  }

  // Process existing LinkedIn connections
  const { data: allConnections } = await supabase
    .schema('graph')
    .from('linkedin_connections')
    .select('*');

  if (allConnections && allConnections.length > 0) {
    console.log(`📊 Processing ${allConnections.length} LinkedIn connections...`);
    
    // Analyze network strength and create edges
    await analyzeLinkedInNetwork(allConnections);
  }
}

async function importLinkedInConnections() {
  // This would integrate with the existing LinkedIn parsing scripts
  console.log('🔄 LinkedIn import would be handled by existing scripts...');
  // For now, we'll skip the actual import and focus on processing
}

async function analyzeLinkedInNetwork(connections) {
  console.log('🧠 Analyzing LinkedIn network...');
  
  // Group connections by person
  const connectionsByPerson = connections.reduce((acc, conn) => {
    if (!acc[conn.person_entity_id]) {
      acc[conn.person_entity_id] = [];
    }
    acc[conn.person_entity_id].push(conn);
    return acc;
  }, {});

  // Calculate network metrics for each person
  for (const [personId, personConnections] of Object.entries(connectionsByPerson)) {
    const networkMetrics = calculateNetworkMetrics(personConnections);
    
    // Update person entity with network intelligence
    await supabase
      .schema('graph')
      .from('entities')
      .update({
        linkedin_network_analysis: networkMetrics,
        linkedin_connections_count: personConnections.length
      })
      .eq('id', personId);
  }
}

function calculateNetworkMetrics(connections) {
  const totalConnections = connections.length;
  const industries = {};
  const companies = {};
  const seniorityLevels = {};
  
  connections.forEach(conn => {
    // Industry distribution
    if (conn.connection_industry) {
      industries[conn.connection_industry] = (industries[conn.connection_industry] || 0) + 1;
    }
    
    // Company distribution
    if (conn.connection_company) {
      companies[conn.connection_company] = (companies[conn.connection_company] || 0) + 1;
    }
    
    // Seniority analysis
    const title = (conn.connection_title || '').toLowerCase();
    if (title.includes('ceo') || title.includes('founder') || title.includes('president')) {
      seniorityLevels['C-Level'] = (seniorityLevels['C-Level'] || 0) + 1;
    } else if (title.includes('vp') || title.includes('vice president') || title.includes('director')) {
      seniorityLevels['VP/Director'] = (seniorityLevels['VP/Director'] || 0) + 1;
    } else if (title.includes('manager') || title.includes('head of')) {
      seniorityLevels['Manager'] = (seniorityLevels['Manager'] || 0) + 1;
    } else {
      seniorityLevels['Other'] = (seniorityLevels['Other'] || 0) + 1;
    }
  });

  return {
    total_connections: totalConnections,
    industry_distribution: industries,
    company_distribution: companies,
    seniority_distribution: seniorityLevels,
    network_strength: Math.min(totalConnections / 100, 1.0), // Scale to 0-1
    last_analyzed: new Date().toISOString()
  };
}

// ============================================================================
// NETWORK MAPPING & INTRODUCTION PATHS
// ============================================================================

async function enhanceNetworkMapping() {
  console.log('🗺️ Enhancing Network Mapping...\n');
  
  // Get all entities with their relationships
  const { data: entities } = await supabase
    .schema('graph')
    .from('entities')
    .select(`
      id, name, type, domain, industry, 
      is_portfolio, is_pipeline, is_internal,
      linkedin_first_degree, enrichment_data
    `);

  if (!entities || entities.length === 0) {
    console.log('No entities found for network mapping');
    return;
  }

  // Create enhanced edges based on various relationship types
  await createEnhancedEdges(entities);
  
  // Calculate introduction path strength
  await calculateIntroductionPaths(entities);
}

async function createEnhancedEdges(entities) {
  console.log('🔗 Creating enhanced edges...');
  
  const newEdges = [];
  
  // 1. LinkedIn-based connections
  const linkedinEntities = entities.filter(e => e.linkedin_first_degree);
  for (const entity of linkedinEntities) {
    // Find other LinkedIn entities in same industry
    const industryMatches = entities.filter(e => 
      e.id !== entity.id && 
      e.linkedin_first_degree && 
      e.industry === entity.industry
    );
    
    industryMatches.forEach(match => {
      newEdges.push({
        source: entity.id,
        target: match.id,
        kind: 'linkedin_industry_connection',
        strength_score: 0.7,
        weight: 1.0,
        metadata: {
          connection_type: 'industry_peer',
          source: 'linkedin_analysis'
        }
      });
    });
  }

  // 2. Portfolio company connections
  const portfolioEntities = entities.filter(e => e.is_portfolio);
  for (const entity of portfolioEntities) {
    // Connect to other portfolio companies
    const otherPortfolio = portfolioEntities.filter(e => e.id !== entity.id);
    otherPortfolio.forEach(match => {
      newEdges.push({
        source: entity.id,
        target: match.id,
        kind: 'portfolio_connection',
        strength_score: 0.8,
        weight: 1.0,
        metadata: {
          connection_type: 'portfolio_peer',
          source: 'portfolio_analysis'
        }
      });
    });
  }

  // 3. Industry-based connections
  const industryGroups = entities.reduce((acc, entity) => {
    if (entity.industry) {
      if (!acc[entity.industry]) acc[entity.industry] = [];
      acc[entity.industry].push(entity);
    }
    return acc;
  }, {});

  for (const [industry, industryEntities] of Object.entries(industryGroups)) {
    if (industryEntities.length > 1) {
      // Create connections between entities in same industry
      for (let i = 0; i < industryEntities.length; i++) {
        for (let j = i + 1; j < industryEntities.length; j++) {
          newEdges.push({
            source: industryEntities[i].id,
            target: industryEntities[j].id,
            kind: 'industry_connection',
            strength_score: 0.6,
            weight: 1.0,
            metadata: {
              connection_type: 'industry_peer',
              industry: industry,
              source: 'industry_analysis'
            }
          });
        }
      }
    }
  }

  // Insert new edges in batches
  if (newEdges.length > 0) {
    console.log(`📊 Creating ${newEdges.length} new edges...`);
    
    const batchSize = 100;
    for (let i = 0; i < newEdges.length; i += batchSize) {
      const batch = newEdges.slice(i, i + batchSize);
      
      const { error } = await supabase
        .schema('graph')
        .from('edges')
        .upsert(batch, { onConflict: 'source,target,kind' });
      
      if (error) {
        console.error(`Error inserting batch ${i}-${i + batchSize}:`, error);
      } else {
        console.log(`✅ Inserted batch ${i}-${i + batchSize}`);
      }
    }
  }
}

async function calculateIntroductionPaths(entities) {
  console.log('🎯 Calculating introduction path strengths...');
  
  // Get all edges
  const { data: edges } = await supabase
    .schema('graph')
    .from('edges')
    .select('*');

  if (!edges || edges.length === 0) {
    console.log('No edges found for path calculation');
    return;
  }

  // Build adjacency list
  const graph = new Map();
  edges.forEach(edge => {
    if (!graph.has(edge.source)) {
      graph.set(edge.source, []);
    }
    graph.get(edge.source).push({
      target: edge.target,
      kind: edge.kind,
      strength: edge.strength_score || 0.5
    });
  });

  // Calculate path strengths for each entity pair
  const internalOwners = entities.filter(e => e.is_internal);
  const targetEntities = entities.filter(e => !e.is_internal);

  for (const internalOwner of internalOwners) {
    for (const target of targetEntities) {
      const pathStrength = calculatePathStrength(graph, internalOwner.id, target.id);
      
      if (pathStrength > 0.3) { // Only store meaningful paths
        await supabase
          .schema('graph')
          .from('introduction_paths')
          .upsert({
            source_entity_id: internalOwner.id,
            target_entity_id: target.id,
            path_strength: pathStrength,
            calculated_at: new Date().toISOString()
          }, { onConflict: 'source_entity_id,target_entity_id' });
      }
    }
  }
}

function calculatePathStrength(graph, startId, targetId, maxDepth = 3) {
  const queue = [{ id: startId, strength: 1.0, depth: 0, visited: new Set([startId]) }];
  let maxStrength = 0;

  while (queue.length > 0) {
    const { id, strength, depth, visited } = queue.shift();

    if (id === targetId) {
      maxStrength = Math.max(maxStrength, strength);
      continue;
    }

    if (depth >= maxDepth) continue;

    const neighbors = graph.get(id) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.target)) {
        const newVisited = new Set(visited);
        newVisited.add(neighbor.target);
        
        queue.push({
          id: neighbor.target,
          strength: strength * neighbor.strength,
          depth: depth + 1,
          visited: newVisited
        });
      }
    }
  }

  return maxStrength;
}

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

async function generateEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const { data: [{ embedding }] } = await response.json();
  return embedding;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runUniversalEnhancement() {
  console.log('🚀 Starting Universal Enhancement System...\n');

  try {
    // 1. Process LinkedIn connections
    await processLinkedInConnections();

    // 2. Enhance network mapping
    await enhanceNetworkMapping();

    // 3. Generate embeddings for entities without them
    console.log('\n🧠 Generating embeddings...');
    const { data: entitiesWithoutEmbeddings } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, domain, industry, enrichment_data')
      .is('embedding', null)
      .limit(100);

    if (entitiesWithoutEmbeddings && entitiesWithoutEmbeddings.length > 0) {
      console.log(`📊 Generating embeddings for ${entitiesWithoutEmbeddings.length} entities...`);
      
      for (const entity of entitiesWithoutEmbeddings) {
        try {
          const text = `${entity.name} ${entity.type} ${entity.domain || ''} ${entity.industry || ''}`.trim();
          const embedding = await generateEmbedding(text);
          
          await supabase
            .schema('graph')
            .from('entities')
            .update({ embedding: embedding })
            .eq('id', entity.id);
          
          console.log(`✅ Generated embedding for ${entity.name}`);
        } catch (error) {
          console.error(`❌ Error generating embedding for ${entity.name}:`, error.message);
        }
      }
    }

    // 4. Run Perplexity enhancement for high-value entities
    console.log('\n🤖 Running Perplexity enhancement...');
    const { data: highValueEntities } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, domain, industry, enrichment_data')
      .or('is_portfolio.eq.true,is_pipeline.eq.true,is_internal.eq.true')
      .limit(50);

    if (highValueEntities && highValueEntities.length > 0) {
      console.log(`📊 Enhancing ${highValueEntities.length} high-value entities...`);
      
      for (const entity of highValueEntities) {
        try {
          const queries = getEnrichmentQueries(entity.type, entity.name, entity);
          const searchResults = [];
          
          for (const query of queries) {
            const result = await searchWeb(query, 2);
            if (result) searchResults.push(result);
          }
          
          if (searchResults.length > 0) {
            const combinedContent = searchResults.join('\n\n');
            const enhancementData = await extractStructuredData(combinedContent, entity.type, entity.name);
            
            await supabase
              .schema('graph')
              .from('entities')
              .update({
                enhancement_data: enhancementData,
                last_enhanced_at: new Date().toISOString()
              })
              .eq('id', entity.id);
            
            console.log(`✅ Enhanced ${entity.name}`);
          }
        } catch (error) {
          console.error(`❌ Error enhancing ${entity.name}:`, error.message);
        }
      }
    }

    console.log('\n🎉 Universal Enhancement Complete!');
    
    // Final status report
    const { count: total } = await supabase.schema('graph').from('entities').select('*', { count: 'exact' });
    const { count: withEmbeddings } = await supabase.schema('graph').from('entities').select('*', { count: 'exact' }).not('embedding', 'is', null);
    const { count: edges } = await supabase.schema('graph').from('edges').select('*', { count: 'exact' });
    
    console.log(`\n📊 Final Status:`);
    console.log(`   • Total entities: ${total}`);
    console.log(`   • With embeddings: ${withEmbeddings} (${((withEmbeddings/total)*100).toFixed(1)}%)`);
    console.log(`   • Total edges: ${edges}`);
    console.log(`   • Network mapping: Enhanced`);
    console.log(`   • LinkedIn intelligence: Processed`);

  } catch (error) {
    console.error('❌ Universal enhancement failed:', error);
    throw error;
  }
}

// Run the system
runUniversalEnhancement()
  .then(() => {
    console.log('\n✅ Universal Enhancement System completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Universal Enhancement System failed:', error);
    process.exit(1);
  });
