import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    console.log('Fetching Affinity Lists...');
    const auth = Buffer.from(`:${process.env.AFFINITY_API_KEY}`).toString('base64');
    
    try {
        const response = await axios.get('https://api.affinity.co/lists', {
            headers: { Authorization: `Basic ${auth}` }
        });

        console.log('Lists found:');
        response.data.forEach((list: any) => {
            console.log(`- ${list.name} (ID: ${list.id}, Type: ${list.type})`);
        });

    } catch (e: any) {
        console.error('Error fetching lists:', e.message);
    }
}

main();

