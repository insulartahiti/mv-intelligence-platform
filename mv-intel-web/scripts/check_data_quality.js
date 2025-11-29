
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Try loading .env from various locations
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../../../.env.local')
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

async function checkQuality() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('🔍 Starting Data Quality Audit...');

    // 1. Check for Empty/Short Business Analysis
    const shortAnalysis = await client.query(`
      SELECT id, name, type, enrichment_source, business_analysis
      FROM graph.entities
      WHERE business_analysis IS NOT NULL
      AND (
        length(business_analysis->>'core_business') < 50
        OR business_analysis->>'core_business' ILIKE '%unknown%'
        OR business_analysis->>'core_business' ILIKE '%not found%'
      )
    `);
    
    console.log(`\n🚩 FLAG: Short/Empty Analysis (${shortAnalysis.rowCount} entities)`);
    shortAnalysis.rows.forEach(r => {
      const cb = r.business_analysis?.core_business;
      const display = typeof cb === 'string' ? cb.substring(0, 50) : String(cb);
      console.log(`   - ${r.name} (${r.type}): ${display}...`);
    });

    // 2. Check for Low Confidence Taxonomy
    const lowConfidence = await client.query(`
      SELECT id, name, taxonomy, taxonomy_confidence
      FROM graph.entities
      WHERE taxonomy_confidence < 0.6
      AND taxonomy_confidence IS NOT NULL
    `);

    console.log(`\n⚠️ WARNING: Low Confidence Taxonomy (< 0.6) (${lowConfidence.rowCount} entities)`);
    lowConfidence.rows.forEach(r => {
      console.log(`   - ${r.name}: ${r.taxonomy} (${r.taxonomy_confidence})`);
    });

    // 3. Check for Potential Hallucinations (Missing Evidence in Perplexity source)
    // Only applies if we successfully migrated to the new schema with evidence_source
    const missingEvidence = await client.query(`
      SELECT id, name
      FROM graph.entities
      WHERE enrichment_source = 'perplexity'
      AND (business_analysis->>'evidence_source') IS NULL
      AND business_analysis IS NOT NULL
      limit 10; -- Sample only as legacy data won't have it
    `);

    console.log(`\nℹ️ INFO: Entities without explicit evidence source (Legacy/Pre-Update data): ${missingEvidence.rowCount} (Sample)`);

    // 4. Check for Disconnected Nodes (Islands)
    const disconnected = await client.query(`
      SELECT e.id, e.name, e.type
      FROM graph.entities e
      LEFT JOIN graph.edges edge1 ON e.id = edge1.source
      LEFT JOIN graph.edges edge2 ON e.id = edge2.target
      WHERE edge1.id IS NULL AND edge2.id IS NULL
      AND e.business_analysis IS NOT NULL -- Only care if we tried to enrich it
      LIMIT 20
    `);

    console.log(`\n🏝️ ISLANDS: Enriched entities with NO connections (${disconnected.rowCount} found)`);
    disconnected.rows.forEach(r => {
      console.log(`   - ${r.name} (${r.type})`);
    });

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await client.end();
  }
}

checkQuality();

