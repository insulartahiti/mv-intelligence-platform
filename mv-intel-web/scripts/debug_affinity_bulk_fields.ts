import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    console.log('Testing bulk field values fetch...');
    const auth = Buffer.from(`:${process.env.AFFINITY_API_KEY}`).toString('base64');
    const STATUS_FIELD_ID = 1163869; // Motive Ventures Pipeline Status

    try {
        const response = await axios.get(`https://api.affinity.co/field-values`, {
            headers: { Authorization: `Basic ${auth}` },
            params: { 
                field_id: STATUS_FIELD_ID,
                page_size: 10 
            }
        });

        console.log(`Fetch success! Got ${response.data.length} values.`);
        if (response.data.length > 0) {
            console.log('Sample:', JSON.stringify(response.data[0], null, 2));
        }

    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.response) console.error('Status:', e.response.status, e.response.data);
    }
}

main();

