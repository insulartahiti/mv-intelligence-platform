import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const auth = Buffer.from(`:${process.env.AFFINITY_API_KEY}`).toString('base64');
    
    // Find "Februar" ID
    console.log('Finding Februar...');
    const searchRes = await axios.get(`https://api.affinity.co/organizations?term=Februar`, {
        headers: { Authorization: `Basic ${auth}` }
    });
    
    const org = searchRes.data.organizations[0];
    if (!org) {
        console.error('Februar not found');
        return;
    }
    console.log(`Found Org: ${org.name} (ID: ${org.id})`);

    // Get Field Values (Global)
    console.log('Fetching global field values...');
    const valuesRes = await axios.get(`https://api.affinity.co/field-values`, {
        headers: { Authorization: `Basic ${auth}` },
        params: { organization_id: org.id }
    });

    console.log('Field Values:');
    valuesRes.data.forEach((v: any) => {
        // We don't have field names here, just IDs. 
        // But let's look for arrays of numbers (which usually indicate People IDs)
        if (Array.isArray(v.value) && v.value.length > 0) {
            console.log(`- Field ${v.field_id}: Array [${v.value.length} items] example: ${v.value[0]}`);
        } else {
            console.log(`- Field ${v.field_id}: ${JSON.stringify(v.value)}`);
        }
    });
}

main();

