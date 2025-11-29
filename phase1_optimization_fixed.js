require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createOrUpdateEdge(sourceId, targetId, kind, strength = 0.5) {
  const { data, error } = await supabase
    .schema('graph')
    .from('edges')
    .upsert(
      {
        source: sourceId,
        target: targetId,
        kind: kind,
        strength_score: strength,
        source_type: 'phase1_optimization'
      },
      { onConflict: ['source', 'target', 'kind'], ignoreDuplicates: true }
    )
    .select('id')
    .single();

  if (error && error.code !== '23505') { // 23505 is unique violation, which upsert handles
    console.error(`❌ Error creating edge ${sourceId} → ${targetId} (${kind}):`, error);
    return false;
  }
  return true;
}

async function extractFounderRelationshipsFromAffinity() {
  console.log('👥 Phase 1.1: Extracting Founder Relationships from Affinity Data...');
  
  try {
    // Get portfolio companies with enrichment data
    const { data: portfolioCompanies, error: portfolioError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, pipeline_stage, enrichment_data')
      .eq('is_portfolio', true)
      .not('enrichment_data', 'is', null)
      .limit(10);

    if (portfolioError) {
      console.error('❌ Error fetching portfolio companies:', portfolioError);
      return 0;
    }

    console.log(`   Found ${portfolioCompanies?.length || 0} portfolio companies with enrichment data`);

    let founderRelationshipsCreated = 0;

    for (const company of portfolioCompanies || []) {
      try {
        const enrichData = company.enrichment_data;
        if (enrichData && enrichData.web_search_data) {
          const webData = JSON.parse(enrichData.web_search_data);
          
          // Extract founder/CEO information from web search results
          if (webData.results && webData.results.length > 0) {
            const founderNames = extractFounderNamesFromWebData(webData.results, company.name);
            
            for (const founderName of founderNames) {
              // Check if founder exists in our database
              const { data: founderEntity, error: founderError } = await supabase
                .schema('graph')
                .from('entities')
                .select('id, name, type')
                .eq('name', founderName)
                .eq('type', 'person')
                .single();

              if (founderEntity) {
                // Create founder relationship
                const success = await createOrUpdateEdge(
                  founderEntity.id,
                  company.id,
                  'founder',
                  0.9
                );
                
                if (success) {
                  console.log(`   ✅ ${founderName} → ${company.name} (founder)`);
                  founderRelationshipsCreated++;
                }
              } else {
                // Create founder entity if not exists
                const { data: newFounder, error: createError } = await supabase
                  .schema('graph')
                  .from('entities')
                  .insert({
                    name: founderName,
                    type: 'person',
                    source_type: 'phase1_optimization',
                    enrichment_data: {
                      extracted_from: company.name,
                      extraction_method: 'affinity_web_search',
                      last_enhanced: new Date().toISOString()
                    }
                  })
                  .select('id')
                  .single();

                if (newFounder && !createError) {
                  const success = await createOrUpdateEdge(
                    newFounder.id,
                    company.id,
                    'founder',
                    0.9
                  );
                  
                  if (success) {
                    console.log(`   ✅ Created ${founderName} → ${company.name} (founder)`);
                    founderRelationshipsCreated++;
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`   ❌ Error processing ${company.name}:`, error.message);
      }
    }

    console.log(`   📊 Created ${founderRelationshipsCreated} founder relationships`);
    return founderRelationshipsCreated;

  } catch (error) {
    console.error('❌ Error in founder extraction:', error);
    return 0;
  }
}

function extractFounderNamesFromWebData(webResults, companyName) {
  const founderNames = new Set();
  
  for (const result of webResults) {
    const text = `${result.title} ${result.snippet}`.toLowerCase();
    
    // Look for founder/CEO patterns
    const founderPatterns = [
      /founded by ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /ceo ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /co-founder ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /founder ([A-Z][a-z]+ [A-Z][a-z]+)/g,
      /co-founder and ceo ([A-Z][a-z]+ [A-Z][a-z]+)/g
    ];
    
    for (const pattern of founderPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1];
        if (name && name.length > 3 && name.length < 50) {
          founderNames.add(name);
        }
      }
    }
  }
  
  return Array.from(founderNames).slice(0, 3); // Limit to 3 founders per company
}

async function createEmploymentRelationships() {
  console.log('\\n💼 Phase 1.2: Creating Employment Relationships...');
  
  try {
    // Get persons with Affinity IDs (these are likely employees/contacts)
    const { data: affinityPersons, error: personError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, affinity_person_id, enrichment_data')
      .eq('type', 'person')
      .not('affinity_person_id', 'is', null)
      .limit(20);

    if (personError) {
      console.error('❌ Error fetching Affinity persons:', personError);
      return 0;
    }

    console.log(`   Found ${affinityPersons?.length || 0} persons with Affinity IDs`);

    let employmentRelationshipsCreated = 0;

    for (const person of affinityPersons || []) {
      try {
        // Try to extract company information from enrichment data
        if (person.enrichment_data) {
          const enrichData = person.enrichment_data;
          
          // Look for company mentions in enrichment data
          const companyMentions = extractCompanyMentionsFromPersonData(enrichData, person.name);
          
          for (const companyName of companyMentions) {
            // Find matching company in our database
            const { data: companyEntity, error: companyError } = await supabase
              .schema('graph')
              .from('entities')
              .select('id, name, type')
              .ilike('name', `%${companyName}%`)
              .eq('type', 'organization')
              .limit(1)
              .single();

            if (companyEntity) {
              const success = await createOrUpdateEdge(
                person.id,
                companyEntity.id,
                'works_at',
                0.8
              );
              
              if (success) {
                console.log(`   ✅ ${person.name} → ${companyEntity.name} (works_at)`);
                employmentRelationshipsCreated++;
              }
            }
          }
        }
      } catch (error) {
        console.error(`   ❌ Error processing ${person.name}:`, error.message);
      }
    }

    console.log(`   📊 Created ${employmentRelationshipsCreated} employment relationships`);
    return employmentRelationshipsCreated;

  } catch (error) {
    console.error('❌ Error in employment extraction:', error);
    return 0;
  }
}

function extractCompanyMentionsFromPersonData(enrichData, personName) {
  const companyMentions = new Set();
  
  // Look for company mentions in various enrichment fields
  const searchFields = [
    enrichData.current_company,
    enrichData.company,
    enrichData.organization,
    enrichData.employer
  ];
  
  for (const field of searchFields) {
    if (field && typeof field === 'string' && field.length > 2) {
      companyMentions.add(field);
    }
  }
  
  return Array.from(companyMentions).slice(0, 2); // Limit to 2 companies per person
}

async function fixPortfolioRelationships() {
  console.log('\\n🏦 Phase 1.3: Fixing Portfolio Relationships...');
  
  try {
    // Get portfolio companies
    const { data: portfolioCompanies, error: portfolioError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, pipeline_stage')
      .eq('is_portfolio', true);

    if (portfolioError) {
      console.error('❌ Error fetching portfolio companies:', portfolioError);
      return 0;
    }

    console.log(`   Found ${portfolioCompanies?.length || 0} portfolio companies`);

    // Get fund entities
    const { data: fundEntities, error: fundError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type')
      .eq('type', 'fund');

    if (fundError) {
      console.error('❌ Error fetching fund entities:', fundError);
      return 0;
    }

    const fundMap = {};
    fundEntities?.forEach(fund => {
      fundMap[fund.name] = fund.id;
    });

    console.log(`   Found ${fundEntities?.length || 0} fund entities`);

    let portfolioRelationshipsCreated = 0;

    for (const company of portfolioCompanies || []) {
      const fundName = company.pipeline_stage;
      const fundId = fundMap[fundName];
      
      if (fundId) {
        const success = await createOrUpdateEdge(
          fundId,
          company.id,
          'invests_in',
          0.9
        );
        
        if (success) {
          console.log(`   ✅ ${fundName} → ${company.name} (invests_in)`);
          portfolioRelationshipsCreated++;
        }
      }
    }

    console.log(`   📊 Created ${portfolioRelationshipsCreated} portfolio relationships`);
    return portfolioRelationshipsCreated;

  } catch (error) {
    console.error('❌ Error in portfolio relationship creation:', error);
    return 0;
  }
}

async function generateEmbeddingsForAllEntities() {
  console.log('\\n🧠 Phase 1.4: Generating Embeddings for All Entities...');
  
  try {
    // Get entities without embeddings
    const { data: entitiesWithoutEmbeddings, error: embedError } = await supabase
      .schema('graph')
      .from('entities')
      .select('id, name, type, enrichment_data')
      .is('embedding', null)
      .limit(10); // Start with just 10 to test

    if (embedError) {
      console.error('❌ Error fetching entities without embeddings:', embedError);
      return 0;
    }

    console.log(`   Found ${entitiesWithoutEmbeddings?.length || 0} entities without embeddings`);

    let embeddingsGenerated = 0;

    for (const entity of entitiesWithoutEmbeddings || []) {
      try {
        // Create embedding text from entity data
        const embeddingText = createEmbeddingText(entity);
        
        // Generate embedding using OpenAI
        const embedding = await generateEmbedding(embeddingText);
        
        if (embedding) {
          // Update entity with embedding
          const { error: updateError } = await supabase
            .schema('graph')
            .from('entities')
            .update({ embedding: embedding })
            .eq('id', entity.id);

          if (!updateError) {
            console.log(`   ✅ Generated embedding for ${entity.name}`);
            embeddingsGenerated++;
          } else {
            console.error(`   ❌ Error updating embedding for ${entity.name}:`, updateError);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`   ❌ Error generating embedding for ${entity.name}:`, error.message);
      }
    }

    console.log(`   📊 Generated ${embeddingsGenerated} embeddings`);
    return embeddingsGenerated;

  } catch (error) {
    console.error('❌ Error in embedding generation:', error);
    return 0;
  }
}

function createEmbeddingText(entity) {
  let text = entity.name;
  
  if (entity.type) {
    text += ` ${entity.type}`;
  }
  
  if (entity.enrichment_data) {
    const enrichData = entity.enrichment_data;
    
    if (enrichData.industry) {
      text += ` ${enrichData.industry}`;
    }
    
    if (enrichData.domain) {
      text += ` ${enrichData.domain}`;
    }
    
    if (enrichData.description) {
      text += ` ${enrichData.description}`;
    }
  }
  
  return text;
}

async function generateEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 1536 // Use 1536 dimensions to match our schema
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

async function runPhase1Optimization() {
  console.log('🚀 Starting Phase 1 Optimization System (Fixed)...');
  console.log('Cross-referencing Affinity database for accurate relationship extraction');
  
  const startTime = Date.now();
  
  try {
    // Phase 1.1: Extract founder relationships from Affinity + Perplexity data
    const founderCount = await extractFounderRelationshipsFromAffinity();
    
    // Phase 1.2: Create employment relationships from Affinity person data
    const employmentCount = await createEmploymentRelationships();
    
    // Phase 1.3: Fix portfolio relationships using Affinity status field
    const portfolioCount = await fixPortfolioRelationships();
    
    // Phase 1.4: Generate embeddings for all entities
    const embeddingCount = await generateEmbeddingsForAllEntities();
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\\n🎯 Phase 1 Optimization Summary');
    console.log('==================================================');
    console.log('\\n📊 Results:');
    console.log(`   ✅ Founder Relationships: ${founderCount}`);
    console.log(`   ✅ Employment Relationships: ${employmentCount}`);
    console.log(`   ✅ Portfolio Relationships: ${portfolioCount}`);
    console.log(`   ✅ Embeddings Generated: ${embeddingCount}`);
    console.log(`   ⏱️  Duration: ${duration.toFixed(2)}s`);
    
    console.log('\\n🚀 Next Steps:');
    console.log('   1. Test enhanced search with new relationships');
    console.log('   2. Validate connection queries with founder data');
    console.log('   3. Monitor search performance improvements');
    console.log('   4. Plan Phase 2: Data Source Integration');
    
  } catch (error) {
    console.error('❌ Error in Phase 1 optimization:', error);
  }
}

runPhase1Optimization();




