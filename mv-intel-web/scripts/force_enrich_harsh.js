const EnhancedPersonEmbeddingGenerator = require('../enhanced_person_embedding_generator');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function forceEnrichHarsh() {
  console.log('🚀 Force Enriching Harsh Govil...');
  
  const generator = new EnhancedPersonEmbeddingGenerator();
  
  // Fetch Harsh
  const res = await pool.query("SELECT * FROM graph.entities WHERE name = 'Harsh Govil' LIMIT 1");
  if (res.rows.length === 0) {
    console.error('❌ Harsh Govil not found in DB');
    process.exit(1);
  }
  
  const harsh = res.rows[0];
  console.log(`Found Harsh Govil (ID: ${harsh.id})`);

  // Reset his analysis to force processing
  // Actually, the generator class doesn't check for null if we call processPerson directly,
  // but let's ensure we are using the new logic.
  
  const result = await generator.processPerson(harsh);
  
  if (result) {
    console.log('✅ Analysis Result:', JSON.stringify(result.analysis, null, 2));
    await generator.updateEntityData(result);
    console.log('✅ Database Updated.');
  } else {
    console.error('❌ Enrichment failed.');
  }
  
  await pool.end();
}

forceEnrichHarsh().catch(console.error);

