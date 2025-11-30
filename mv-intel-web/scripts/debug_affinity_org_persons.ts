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
    const ORG_ID = 286829338; // Februar ID from previous debug

    try {
        console.log(`Fetching Org Details for ID: ${ORG_ID}...`);
        const response = await axios.get(`https://api.affinity.co/organizations/${ORG_ID}`, {
            headers: { Authorization: `Basic ${auth}` }
        });

        const org = response.data;
        console.log('Organization Object Keys:', Object.keys(org));
        
        if (org.person_ids) {
            console.log(`✅ person_ids found! Count: ${org.person_ids.length}`);
            console.log('Sample IDs:', org.person_ids.slice(0, 5));
        } else {
            console.log('❌ person_ids NOT found in response.');
        }

    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

main();

