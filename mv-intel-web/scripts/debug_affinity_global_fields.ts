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
    
    try {
        console.log('Fetching Global Organization Fields...');
        const response = await axios.get(`https://api.affinity.co/fields`, {
            headers: { Authorization: `Basic ${auth}` },
            params: { type: 'organization' } // Filter for Org fields
        });

        console.log('Global Fields:');
        response.data.forEach((f: any) => {
            // Look for fields that accept Persons (value_type: 0)
            if (f.value_type === 0) {
                console.log(`- ${f.name} (ID: ${f.id}) [Person Link]`);
            }
        });

    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

main();

