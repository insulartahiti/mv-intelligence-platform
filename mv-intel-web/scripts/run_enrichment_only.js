const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

// Generate a unique ID for this pipeline run
const SYNC_LOG_ID = crypto.randomUUID();

// Simple file logger
function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}\n`;
    console.log(msg);
    try {
        fs.appendFileSync(path.join(__dirname, '../../pipeline.log'), line);
    } catch (e) {
        // ignore log error
    }
}

log('🚀 Enrichment-Only Pipeline script started');

// Load Env
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../../.env.local')
];
let envLoaded = false;
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    log(`Loading env from: ${p}`);
    require('dotenv').config({ path: p });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
    log('⚠️ No .env.local found! Relying on process.env');
}

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    log('❌ Supabase credentials missing!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function updateSyncStatus(status, error = null) {
  try {
    log(`Updating status to: ${status} (ID: ${SYNC_LOG_ID})`);
    
    const { error: upsertError } = await supabase
        .schema('graph')
        .from('sync_state')
        .upsert({
            id: SYNC_LOG_ID,
            status: status,
            error_message: error,
            last_sync_timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

    if (upsertError) throw upsertError;
    
  } catch (err) {
    log(`❌ Failed to update sync status: ${err.message}`);
  }
}

// Utility to run a script and wait for it
function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    log(`\n🚀 STARTING: ${scriptName} ${args.join(' ')}`);
    
    const scriptPath = path.resolve(__dirname, scriptName);
    const isTs = scriptName.endsWith('.ts');
    const command = isTs ? 'npx' : 'node';
    const scriptArgs = isTs ? ['tsx', scriptPath, ...args] : [scriptPath, ...args];
    
    const child = spawn(command, scriptArgs, {
      stdio: 'inherit', // Pipe output to main console
      env: { ...process.env, SYNC_LOG_ID } // Pass ID to children
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ COMPLETED: ${scriptName}`);
        resolve();
      } else {
        log(`❌ FAILED: ${scriptName} (Exit Code: ${code})`);
        reject(new Error(`${scriptName} failed`));
      }
    });
  });
}

async function runEnrichmentPipeline() {
  log('==================================================');
  log('   MV INTELLIGENCE PLATFORM - ENRICHMENT ONLY     ');
  log('==================================================');

  // Check for test mode
  const args = process.argv.slice(2);
  const isTestMode = args.includes('--test');
  const limitArg = isTestMode ? ['--limit', '5'] : [];
  
  if (isTestMode) {
      log('🧪 TEST MODE ACTIVE: All steps will run with --limit 5');
  }

  try {
    // Set status to RUNNING (Note: DB check constraint only allows 'idle', 'running', 'error')
    await updateSyncStatus('running', 'Enrichment-Only Pipeline Started');

    log('⚡ Starting Parallel Processing Block (Enrichment & Embeddings)...');
    
    // PARALLEL BLOCK: Run independent processing tasks concurrently
    // Skipping Affinity Sync -> Assumes data is already in DB
    await Promise.all([
        runScript('embed_interactions.ts', limitArg),
        runScript('summarize_interactions.ts', limitArg),
        runScript('../enhanced_embedding_generator.js', ['--incremental', ...limitArg])
    ]);

    log('✅ Parallel Processing Block Completed.');

    // 3. Neo4j Sync (Initial)
    // Sync existing edges + new enriched data to Neo4j
    await runScript('migrate-to-neo4j.ts'); 

    // 4. Person Enrichment
    // Enrich people (using company context from Neo4j/Postgres edges)
    await runScript('../enhanced_person_embedding_generator.js', ['--incremental', ...limitArg]);

    // 5. Relationship Extraction
    // Infer NEW edges from the newly enriched data
    await runScript('generate_relationships.js', ['--run-once']);

    // 5.1. Portfolio Flag Propagation
    await runScript('fix_portfolio_flags.ts');

    // 6. Final Cleanup
    await runScript('systematic_cleanup.js');

    // 7. Final Neo4j Sync
    await runScript('migrate-to-neo4j.ts');

    console.log('\n🎉 ENRICHMENT PIPELINE COMPLETED SUCCESSFULLY 🎉');
    log('\n🎉 ENRICHMENT PIPELINE COMPLETED SUCCESSFULLY 🎉');
    
    // Set status to IDLE (Success)
    await updateSyncStatus('idle');

  } catch (err) {
    console.error('\n💥 PIPELINE ABORTED:', err.message);
    log(`\n💥 PIPELINE ABORTED: ${err.message}`);
    
    // Set status to ERROR
    await updateSyncStatus('error', err.message);
    
    process.exit(1);
  }
}

runEnrichmentPipeline();
