const { spawn } = require('child_process');
const path = require('path');
// const { Pool } = require('pg'); // PG fails due to DNS
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

log('🚀 Pipeline script started');

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
      stdio: 'inherit', // Pipe output to main console (which might be ignored in detached mode)
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
    
    // Capture stdout/stderr if we want to log it to file
    // Note: stdio 'inherit' sends it to parent. If parent ignores, we lose it.
    // If we want to capture it in pipeline.log, we need 'pipe' and listeners.
  });
}

async function runPipeline() {
  log('==================================================');
  log('      MV INTELLIGENCE PLATFORM - DATA PIPELINE    ');
  log('==================================================');

  // Check for test mode
  const args = process.argv.slice(2);
  const isTestMode = args.includes('--test');
  const limitArg = isTestMode ? ['--limit', '5'] : [];
  
  if (isTestMode) {
      log('🧪 TEST MODE ACTIVE: All steps will run with --limit 5');
  }

  try {
    // Set status to RUNNING
    await updateSyncStatus('running');

    // 1. Initial Cleanup
    // Remove garbage import artifacts and duplicates before spending money on enrichment
    await runScript('systematic_cleanup.js');

    // 2. Affinity Sync
    // Pull live data from Affinity pipeline first
    await runScript('run_affinity_sync.ts', limitArg);

    log('⚡ Starting Parallel Processing Block...');
    
    // PARALLEL BLOCK: Run independent processing tasks concurrently
    // - embed_interactions: Updates `interactions` table (embeddings)
    // - summarize_interactions: Updates `entity_notes_rollup` table
    // - enhanced_embedding_generator: Updates `entities` table (org enrichment)
    // - enhanced_person_embedding_generator: Updates `entities` table (person enrichment)
    // These tasks touch disjoint data/tables and can run safely in parallel.
    
    await Promise.all([
        runScript('embed_interactions.ts', limitArg),
        runScript('summarize_interactions.ts', limitArg),
        runScript('../enhanced_embedding_generator.js', ['--incremental', ...limitArg]),
        runScript('../enhanced_person_embedding_generator.js', ['--incremental', ...limitArg])
    ]);

    log('✅ Parallel Processing Block Completed.');

    // 5. Relationship Extraction
    // Infer NEW edges from the newly enriched data
    await runScript('generate_relationships.js', ['--run-once']); // Inferencing might need limit? Usually runs on 'unenriched' things.

    // 5.1. Portfolio Flag Propagation
    // Ensure founders of portfolio companies inherit the portfolio status
    await runScript('fix_portfolio_flags.ts');

    // 6. Final Cleanup
    // Deduplicate any nodes created by inference
    await runScript('systematic_cleanup.js');

    // 7. Final Neo4j Sync
    // Ensure all new inferred edges make it to the graph
    await runScript('migrate-to-neo4j.ts');

    console.log('\n🎉 PIPELINE COMPLETED SUCCESSFULLY 🎉');
    log('\n🎉 PIPELINE COMPLETED SUCCESSFULLY 🎉');
    
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

runPipeline();
