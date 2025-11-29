import { AffinityClient } from '../lib/affinity/client';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function inspectAffinityData() {
    const affinity = new AffinityClient(process.env.AFFINITY_API_KEY!);
    const listId = 105972; // Motive Ventures Pipeline

    console.log(`Fetching entries from list ${listId}...`);
    const entries: any = await affinity.getListEntries(listId);
    
    if (Array.isArray(entries)) {
        console.log(`Fetched ${entries.length} entries (Array).`);
        if (entries.length > 0) {
            console.log('Sample Entry Structure:', JSON.stringify(entries[0], null, 2));
        }
    } else {
        console.log('Fetched Object:', Object.keys(entries));
        if (entries.list_entries) {
             console.log(`Has list_entries: ${entries.list_entries.length}`);
             console.log('Sample Entry:', JSON.stringify(entries.list_entries[0], null, 2));
        }
    }
}

inspectAffinityData().catch(console.error);

