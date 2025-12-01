import dotenv from 'dotenv';
import path from 'path';

// Load env vars FIRST
const envPath = path.resolve(process.cwd(), '.env.local');
console.log(`Loading env from ${envPath}`);
dotenv.config({ path: envPath });

if (!process.env.AFFINITY_API_KEY) {
    console.error('❌ AFFINITY_API_KEY is missing');
    process.exit(1);
}

// Then import modules that rely on env vars
// We use dynamic import to ensure env vars are loaded before Supabase client initializes
async function runTest() {
    const { AffinitySyncService } = await import('../lib/affinity/sync');

    class TestSyncService extends AffinitySyncService {
        // Override to dry-run
        async upsertEntity(entityData: any, type: 'person' | 'organization', rawEntry: any = {}, fieldValues: any[] = []): Promise<string> {
            console.log(`\n🔍 [TEST] Processing Entity: ${entityData.name} (${type})`);
            
            const getVal = (id: number) => {
                const f = fieldValues.find(v => v.field_id === id);
                return f?.value?.text || f?.value || null;
            };

            console.log(`   - Status (1163869): ${getVal(1163869)}`);
            console.log(`   - Fund (3565025): ${getVal(3565025)}`);
            console.log(`   - Sourced By (2361553): ${getVal(2361553)}`);
            console.log(`   - Valuation (1163951): ${getVal(1163951)}`);
            console.log(`   - Investment (1163871): ${getVal(1163871)}`);
            console.log(`   - Total Fields: ${fieldValues.length}`);
            
            return 'dummy-id';
        }
        
        async upsertInteraction() { return; }
        async updateSyncProgress() { return; }
        async isInteractionSynced() { return false; }
    }

    console.log('🧪 Starting Field Mapping Test...');
    const service = new TestSyncService();
    
    setTimeout(() => {
        console.log('🛑 Test finished (timeout).');
        process.exit(0);
    }, 15000); 
    
    await service.syncPipelineList("Motive Ventures Pipeline");
}

runTest();
