const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Try loading .env from various locations
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../../../.env.local')
];

let envLoaded = false;
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    console.log(`Loading .env from: ${p}`);
    require('dotenv').config({ path: p });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('Warning: Could not find .env.local file. Relying on environment variables.');
}

const OpenAI = require('openai');

// Initialize Supabase Client (Bypass DNS/PG issues)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
const BATCH_SIZE = 10;
const MODEL = 'gpt-5.1'; // Using most advanced model as requested

const RELATIONSHIP_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "relationship_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        relationships: {
          type: "array",
          items: {
            type: "object",
            properties: {
              target_name: {
                type: "string",
                description: "The exact name of the related entity."
              },
              target_type: {
                type: "string",
                enum: ["person", "organization"],
                description: "The type of the related entity."
              },
              relationship_type: {
                type: "string",
                enum: [
                  "competitor", 
                  "partner", 
                  "customer", 
                  "vendor", 
                  "investor", 
                  "invested_in",
                  "subsidiary", 
                  "parent_company",
                  "board_member", 
                  "advisor", 
                  "former_employee",
                  "strategic_alliance"
                ],
                description: "The nature of the relationship."
              },
              confidence: {
                type: "number",
                description: "Confidence score between 0.0 and 1.0."
              },
              evidence: {
                type: "string",
                description: "Quote or reasoning from the text supporting this relationship."
              }
            },
            required: ["target_name", "target_type", "relationship_type", "confidence", "evidence"],
            additionalProperties: false
          }
        }
      },
      required: ["relationships"],
      additionalProperties: false
    }
  }
};

async function extractRelationships(entityName, entityType, businessAnalysis) {
  try {
    const prompt = `
      Analyze the following business analysis data for the entity "${entityName}" (${entityType}).
      Extract explicit relationships with other specific companies or people.
      
      CRITICAL RULES:
      1. STRICTLY TRUTH-BASED: Only extract relationships that are EXPLICITLY stated in the provided text.
      2. NO HALLUCINATIONS: If the text does not mention a specific competitor, partner, or investor by name, do NOT create a relationship.
      3. QUOTE EVIDENCE: You MUST provide the exact substring from the text as 'evidence'. If you cannot find a quote, do not create the relationship.
      
      Focus on:
      - Competitors (mentioned in competitive landscape)
      - Partners / Strategic Alliances
      - Investors (if mentioned as backing the company)
      - Investments (if the entity is a VC/Fund)
      - Key People (Board members, advisors not already structured)
      
      Do NOT infer generic relationships (e.g. "Banks" -> don't create a node called "Banks").
      Only extract specific, named entities (e.g. "Hokodo", "ABN Amro", "Sequoia").
      
      Business Analysis Data:
      ${JSON.stringify(businessAnalysis, null, 2)}
    `;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are an expert graph database architect. Extract structured relationships from business text." },
        { role: "user", content: prompt }
      ],
      response_format: RELATIONSHIP_SCHEMA
    });

    const content = completion.choices[0].message.content;
    return JSON.parse(content);

  } catch (error) {
    console.error(`Error extracting relationships for ${entityName}:`, error.message);
    return { relationships: [] };
  }
}

async function resolveTargetEntity(name, type) {
  // 1. Try exact match
  const { data: exactRes } = await supabase
    .schema('graph')
    .from('entities')
    .select('id')
    .ilike('name', name)
    .eq('type', type)
    .limit(1);
  
  if (exactRes && exactRes.length > 0) {
    return exactRes[0].id;
  }

  // 2. Create placeholder if not found
  const { data: insertRes, error } = await supabase
    .schema('graph')
    .from('entities')
    .insert({
        name, 
        type, 
        enrichment_source: 'relationship_inference', 
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (error) {
      console.error(`Error creating placeholder entity ${name}:`, error.message);
      return null;
  }
  
  console.log(`   + Created new inferred entity: ${name} (${type})`);
  return insertRes.id;
}

async function processBatch() {
  // Fetch entities that have analysis but no extraction timestamp
  const { data: entities, error } = await supabase
    .schema('graph')
    .from('entities')
    .select('id, name, type, business_analysis')
    .not('business_analysis', 'is', null)
    .is('relationships_extracted_at', null)
    .limit(BATCH_SIZE);

  if (error) {
      console.error('Error fetching batch:', error);
      return 0;
  }

  if (!entities || entities.length === 0) return 0;

  console.log(`Processing batch of ${entities.length} entities...`);

  for (const entity of entities) {
    console.log(`> Extracting for: ${entity.name}`);
    
    const extraction = await extractRelationships(entity.name, entity.type, entity.business_analysis);
    const relationships = extraction.relationships || [];

    console.log(`  - Found ${relationships.length} relationships.`);

    for (const rel of relationships) {
      if (rel.target_name.toLowerCase() === entity.name.toLowerCase()) continue; // Skip self-ref

      // Map relationship types to DB allowed enum
      let dbKind = 'partner'; // Default fallback
      const kindMap = {
        'competitor': 'competitor',
        'partner': 'partner',
        'strategic_alliance': 'partner',
        'customer': 'customer',
        'vendor': 'supplier',
        'investor': 'investor',
        'invested_in': 'invests_in',
        'board_member': 'board_member',
        'advisor': 'advisor',
        'subsidiary': 'portfolio_company_of', // approximate
        'parent_company': 'acquired_by', // approximate
        'former_employee': 'works_at' 
      };
      
      if (kindMap[rel.relationship_type]) {
        dbKind = kindMap[rel.relationship_type];
      }

      try {
        const targetId = await resolveTargetEntity(rel.target_name, rel.target_type);
        
        if (targetId) {
            // Upsert Edge
            await supabase
                .schema('graph')
                .from('edges')
                .upsert({
                    source: entity.id,
                    target: targetId,
                    kind: dbKind,
                    confidence_score: rel.confidence,
                    strength_score: rel.confidence,
                    relationship_context: rel.evidence,
                    source_type: 'ai_inference',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'source,target,kind' });
        }
        
      } catch (err) {
        console.error(`  ! Failed to link ${entity.name} -> ${rel.target_name}: ${err.message}`);
      }
    }

    // Mark as processed
    await supabase
        .schema('graph')
        .from('entities')
        .update({ relationships_extracted_at: new Date().toISOString() })
        .eq('id', entity.id);
  }

  return entities.length;
}

async function main() {
  const runOnce = process.argv.includes('--run-once');
  
  try {
    let processed = 0;
    while (true) {
      const count = await processBatch();
      if (count === 0) {
        if (runOnce) {
            console.log('No more entities. Exiting (--run-once mode).');
            break;
        }
        console.log('No more entities to process. Sleeping 10s...');
        await new Promise(r => setTimeout(r, 10000));
      } else {
        processed += count;
        // Small delay to be nice to APIs
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (err) {
    console.error('Fatal error:', err);
  }
}

main();
