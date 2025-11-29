import { AffinityClient } from '../lib/affinity/client';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function debugAffinityEntryType() {
    const affinity = new AffinityClient(process.env.AFFINITY_API_KEY!);
    const listId = 105972; 

    console.log(`Fetching entries from list ${listId}...`);
    const entries: any = await affinity.getListEntries(listId);
    
    const listEntries = entries.list_entries || [];
    console.log(`Fetched ${listEntries.length} entries.`);
    
    if (listEntries.length > 0) {
        const first = listEntries[0];
        console.log('Entity Type:', first.entity_type); // Should be 1 for org?
        console.log('Entity Data:', JSON.stringify(first.entity, null, 2));
    }
}

debugAffinityEntryType().catch(console.error);

