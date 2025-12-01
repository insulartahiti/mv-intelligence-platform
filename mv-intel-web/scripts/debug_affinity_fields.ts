import { AffinityClient } from '../lib/affinity/client';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
// Try multiple paths
const envPaths = [
    path.resolve(__dirname, '../../mv-intel-web/.env.local'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(process.cwd(), '.env.local') 
];

let loaded = false;
for (const p of envPaths) {
    if (require('fs').existsSync(p)) {
        console.log(`Loading env from ${p}`);
        dotenv.config({ path: p });
        loaded = true;
        break;
    }
}

if (!process.env.AFFINITY_API_KEY) {
    console.error('❌ AFFINITY_API_KEY is missing');
    process.exit(1);
}

const client = new AffinityClient(process.env.AFFINITY_API_KEY);

async function debugFields() {
    console.log('🔄 Fetching Lists...');
    const lists = await client.getLists();
    
    const targetList = lists.find(l => l.name === "Motive Ventures Pipeline");
    
    if (!targetList) {
        console.error('❌ "Motive Ventures Pipeline" list not found');
        console.log('Available lists:', lists.map(l => l.name));
        return;
    }

    console.log(`✅ Found List: ${targetList.name} (ID: ${targetList.id})`);
    
    // Affinity API structure: Lists have 'fields' property directly? Or need to fetch fields endpoint?
    // The lists endpoint usually returns basic info. 
    // We should check /fields endpoint or list details.
    
    // Let's try to fetch fields for this list
    // Affinity API: GET /fields?list_id={list_id}
    
    console.log('🔄 Fetching Fields for List...');
    try {
        // We'll use the private request method via a temporary public cast or just add a getFields method
        // Since I can't easily edit the class to add getFields and run this in one go without compiling,
        // I'll assume I can just use the client if I add the method, or I'll implement a raw fetch here.
        
        const response = await fetch(`https://api.affinity.co/fields?list_id=${targetList.id}`, {
            headers: {
                'Authorization': `Basic ${Buffer.from(':' + process.env.AFFINITY_API_KEY).toString('base64')}`
            }
        });
        
        const fields = await response.json();

        console.log('\n📋 AVAILABLE FIELDS MAPPING:');
        console.log('==========================================');
        fields.forEach((f: any) => {
            console.log(`ID: ${f.id.toString().padEnd(10)} | Name: ${f.name}`);
        });
        console.log('==========================================');

    } catch (e) {
        console.error('Error fetching fields:', e);
    }
}

debugFields();
