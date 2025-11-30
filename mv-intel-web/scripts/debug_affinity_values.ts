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
    const LIST_ID = 105972; 

    try {
        console.log(`Fetching entries for List ${LIST_ID}...`);
        const response = await axios.get(`https://api.affinity.co/lists/${LIST_ID}/list-entries`, {
            headers: { Authorization: `Basic ${auth}` },
            params: { page_size: 10 } 
        });

        const entries = response.data.list_entries;
        
        if (entries.length > 0) {
            const entry = entries[0];
            console.log(`Checking values for entry: ${entry.entity.name} (ID: ${entry.id})`);
            
            // Get Field Values
            const valuesRes = await axios.get(`https://api.affinity.co/field-values`, {
                headers: { Authorization: `Basic ${auth}` },
                params: { list_entry_id: entry.id }
            });

            console.log('Field Values:');
            valuesRes.data.forEach((v: any) => {
                console.log(`- Field ID ${v.field_id}: ${JSON.stringify(v.value)}`);
            });
        }

    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

main();

