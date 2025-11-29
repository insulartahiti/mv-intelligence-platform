
const { Client } = require('pg');
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

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Database connection string
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

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

async function getPgClient() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  return client;
}

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

async function resolveTargetEntity(client, name, type) {
  // 1. Try exact match
  const exactRes = await client.query(
    `SELECT id FROM graph.entities WHERE name ILIKE $1 AND type = $2 LIMIT 1`,
    [name, type]
  );
  
  if (exactRes.rows.length > 0) {
    return exactRes.rows[0].id;
  }

  // 2. Create placeholder if not found
  // We mark it as 'pending_enrichment' so the other scripts might pick it up later if we want
  const insertRes = await client.query(
    `INSERT INTO graph.entities (name, type, enrichment_source, created_at, updated_at)
     VALUES ($1, $2, 'relationship_inference', NOW(), NOW())
     RETURNING id`,
    [name, type]
  );
  
  console.log(`   + Created new inferred entity: ${name} (${type})`);
  return insertRes.rows[0].id;
}

async function processBatch(client) {
  // Fetch entities that have analysis but no extraction timestamp
  const res = await client.query(`
    SELECT id, name, type, business_analysis 
    FROM graph.entities 
    WHERE business_analysis IS NOT NULL 
      AND relationships_extracted_at IS NULL
    LIMIT $1
  `, [BATCH_SIZE]);

  if (res.rows.length === 0) return 0;

  console.log(`Processing batch of ${res.rows.length} entities...`);

  for (const entity of res.rows) {
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
        const targetId = await resolveTargetEntity(client, rel.target_name, rel.target_type);
        
        // Insert Edge with correct schema
        await client.query(`
          INSERT INTO graph.edges (
            source, target, kind, 
            confidence_score, 
            strength_score,
            relationship_context,
            source_type,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
          )
          ON CONFLICT (source, target, kind) 
          DO UPDATE SET 
            confidence_score = EXCLUDED.confidence_score,
            strength_score = EXCLUDED.strength_score,
            relationship_context = EXCLUDED.relationship_context,
            updated_at = NOW()
        `, [
          entity.id,
          targetId,
          dbKind,
          rel.confidence,
          rel.confidence, // Use confidence as strength score for AI edges
          rel.evidence,
          'ai_inference'
        ]);
        
      } catch (err) {
        console.error(`  ! Failed to link ${entity.name} -> ${rel.target_name}: ${err.message}`);
      }
    }

    // Mark as processed
    await client.query(
      `UPDATE graph.entities SET relationships_extracted_at = NOW() WHERE id = $1`,
      [entity.id]
    );
  }

  return res.rows.length;
}

async function main() {
  const client = await getPgClient();
  const runOnce = process.argv.includes('--run-once');
  
  try {
    let processed = 0;
    while (true) {
      const count = await processBatch(client);
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
  } finally {
    await client.end();
  }
}

main();

