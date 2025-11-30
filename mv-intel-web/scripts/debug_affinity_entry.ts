import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const { AffinitySyncService } = await import('../lib/affinity/sync');

    console.log('Debugging Affinity Entry...');
    if (!process.env.AFFINITY_API_KEY) {
        console.error('No API Key');
        return;
    }

    const service = new AffinitySyncService();
    const listId = await service.getAffinityListId("Motive Ventures Pipeline");

    if (!listId) {
        console.error('List not found');
        return;
    }

    // Use internal client to get entries
    const response = await (service as any).affinityClient.getListEntries(listId);
    const entries = response.list_entries;

    if (entries && entries.length > 0) {
        const entry = entries[0];
        console.log('Entry Structure:', JSON.stringify(entry, null, 2));
        
        // Check if there's a status field
        // Note: Affinity returns field values in a separate array, usually we need to map them.
        // But let's see what getListEntries returns. 
        // Standard API returns 'entity' and 'status' (if it's a status-enabled list).
    } else {
        console.log('No entries found.');
    }
}

main();

