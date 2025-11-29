const { spawn } = require('child_process');
const path = require('path');

// Utility to run a script and wait for it
function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 STARTING: ${scriptName} ${args.join(' ')}`);
    
    const scriptPath = path.resolve(__dirname, scriptName);
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit', // Pipe output to main console
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ COMPLETED: ${scriptName}`);
        resolve();
      } else {
        console.error(`❌ FAILED: ${scriptName} (Exit Code: ${code})`);
        reject(new Error(`${scriptName} failed`));
      }
    });
  });
}

async function runPipeline() {
  console.log('==================================================');
  console.log('      MV INTELLIGENCE PLATFORM - DATA PIPELINE    ');
  console.log('==================================================');

  try {
    // 1. Initial Cleanup
    // Remove garbage import artifacts and duplicates before spending money on enrichment
    await runScript('systematic_cleanup.js');

    // 2. Affinity Sync
    // Pull live data from Affinity pipeline first
    await runScript('run_affinity_sync.ts');

    // 3. Organization Enrichment
    // Enrich companies first (context for people)
    await runScript('../enhanced_embedding_generator.js', ['--incremental']);

    // 3. Neo4j Sync (Initial)
    // Sync existing edges (like Affinity data) to Neo4j so person enrichment can use graph context
    // This is CRITICAL for correctly identifying investors (Owner/Deal Team edges)
    await runScript('migrate-to-neo4j.ts');

    // 4. Person Enrichment
    // Enrich people (using company context from Neo4j/Postgres edges)
    await runScript('../enhanced_person_embedding_generator.js', ['--incremental']);

    // 5. Relationship Extraction
    // Infer NEW edges from the newly enriched data
    await runScript('generate_relationships.js', ['--run-once']);

    // 6. Final Cleanup
    // Deduplicate any nodes created by inference
    await runScript('systematic_cleanup.js');

    // 7. Final Neo4j Sync
    // Ensure all new inferred edges make it to the graph
    await runScript('migrate-to-neo4j.ts');

    console.log('\n🎉 PIPELINE COMPLETED SUCCESSFULLY 🎉');

  } catch (err) {
    console.error('\n💥 PIPELINE ABORTED:', err.message);
    process.exit(1);
  }
}

// Load Env
const fs = require('fs');
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../../.env.local')
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

runPipeline();
