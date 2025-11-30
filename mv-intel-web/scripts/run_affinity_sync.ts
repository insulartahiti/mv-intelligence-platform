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
    // Default list name
    const stats = await service.syncPipelineList("Motive Ventures Pipeline");

    console.log('\n📊 Sync Complete:');
    console.log(`   - Companies Processed: ${stats.companiesProcessed}`);
    console.log(`   - Companies Upserted: ${stats.companiesUpserted}`);
    console.log(`   - Notes Processed: ${stats.notesProcessed}`);
    console.log(`   - Notes Enriched: ${stats.notesEnriched}`);
    
    if (stats.errors && stats.errors.length > 0) {
        console.log('\n⚠️ Errors:');
        stats.errors.forEach(e => console.log(`   - ${e}`));
        
        // Fail if critical errors occurred
        process.exit(1);
    }
}

runSync().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
});