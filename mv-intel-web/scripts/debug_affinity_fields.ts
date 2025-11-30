import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    console.log('Fetching Affinity List Fields...');
    const auth = Buffer.from(`:${process.env.AFFINITY_API_KEY}`).toString('base64');
    const LIST_ID = 105972; // Motive Ventures Pipeline

    try {
        // 1. Get List Fields
        console.log(`Fetching fields for List ID: ${LIST_ID}`);
        const response = await axios.get(`https://api.affinity.co/lists/${LIST_ID}/fields`, {
            headers: { Authorization: `Basic ${auth}` }
        });

        console.log('Fields found:');
        response.data.forEach((field: any) => {
            console.log(`- ${field.name} (ID: ${field.id}, Type: ${field.value_type})`);
        });

    } catch (e: any) {
        console.error('Error fetching fields:', e.message);
    }
}

main();

