import { AffinitySyncService } from '../lib/affinity/sync';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function runSync() {
    console.log('🚀 Starting Affinity Pipeline Sync...');
    
    if (!process.env.AFFINITY_API_KEY) {
        console.error('❌ AFFINITY_API_KEY is missing in .env.local');
        process.exit(1);
    }

    const service = new AffinitySyncService();
    
    // Check for limit arg
    const args = process.argv.slice(2);
    const limitIdx = args.indexOf('--limit');
    let limit: number | undefined;

    if (limitIdx !== -1) {
        // Validation: Ensure next arg exists and is a valid number
        const val = parseInt(args[limitIdx + 1]);
        if (!isNaN(val) && val > 0) {
            limit = val;
        } else {
            console.warn('⚠️ Invalid or missing limit value provided. Running without limit.');
        }
    }

    // Default list name
    const stats = await service.syncPipelineList("Motive Ventures Pipeline", { limit });

    console.log('\n📊 Sync Complete:');
    console.log(`   - Companies Processed: ${stats.companiesProcessed}`);
    console.log(`   - Companies Upserted: ${stats.companiesUpserted}`);
    console.log(`   - Notes Processed: ${stats.notesProcessed}`);
    console.log(`   - Notes Enriched: ${stats.notesEnriched}`);
    
    if (stats.errors && stats.errors.length > 0) {
        console.log('\n⚠️ Sync finished with warnings:');
        stats.errors.forEach(e => console.log(`   - ${e}`));
        
        // Only fail if NO companies were processed (implies total failure) or critical error
        if (stats.companiesProcessed === 0 && stats.errors.length > 0) {
             console.error('❌ Critical Failure: No companies processed.');
             process.exit(1);
        }
        
        // otherwise, treat as success with warnings
        console.log('✅ Sync completed with warnings (ignoring non-fatal errors).');
    }
}

runSync().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
});