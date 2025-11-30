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
    const LIST_ID = 184048; // MV Portfolio Founders 

    try {
        // 1. Get List Details
        console.log(`Fetching List ${LIST_ID} details...`);
        const listRes = await axios.get(`https://api.affinity.co/lists/${LIST_ID}`, {
            headers: { Authorization: `Basic ${auth}` }
        });
        console.log('List:', listRes.data);

        // 2. Get Fields
        const fieldsRes = await axios.get(`https://api.affinity.co/lists/${LIST_ID}/fields`, {
            headers: { Authorization: `Basic ${auth}` }
        });
        console.log('\nFields:');
        fieldsRes.data.forEach((f: any) => console.log(`- ${f.name} (Type: ${f.value_type})`));

    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.response) console.error('Status:', e.response.status, e.response.data);
    }
}

main();

